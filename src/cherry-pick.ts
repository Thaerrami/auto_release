import inquirer from 'inquirer';
import readline from 'readline';
import chalk from 'chalk';
import { GitClient, RunContext, CherryPickResult } from './types';
import { msg } from './messages';
import { Logger } from './logger';

export function parseShaInput(input: string): string[] {
  if (!input.trim()) return [];

  const parts = input.trim().split(/\s+/);
  const shas: string[] = [];

  for (const part of parts) {
    shas.push(part);
  }

  return shas;
}

async function waitForUserAction(): Promise<'continue' | 'skip' | 'abort'> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  > ', (answer) => {
      rl.close();
      const normalized = answer.trim().toUpperCase();
      if (normalized === 'ABORT') {
        resolve('abort');
      } else if (normalized === 'SKIP') {
        resolve('skip');
      } else {
        resolve('continue');
      }
    });
  });
}

export async function performCherryPicks(
  repoPath: string,
  repoId: string,
  track: string,
  gitClient: GitClient,
  context: RunContext,
  logger: Logger
): Promise<{ shas: string[]; success: boolean; error?: string }> {
  // Use run-wide SHAs if already set (prompt once, use for all repos/tracks)
  let shas: string[];
  if (Array.isArray(context.cherryPickShas)) {
    shas = context.cherryPickShas;
    if (shas.length > 0) {
      console.log(chalk.dim(`  Using cherry-pick SHAs for all: ${shas.join(' ')}`));
      logger.info(`Using run-wide cherry-pick SHAs`, { repo: repoId, track });
    }
  } else {
    const { shaInput } = await inquirer.prompt<{ shaInput: string }>([{
      type: 'input',
      name: 'shaInput',
      message: msg.cherryPickPromptAll(),
    }]);
    shas = parseShaInput(shaInput);
    context.cherryPickShas = shas;
  }
  if (shas.length === 0) {
    logger.info('No cherry-picks requested', { repo: repoId, track });
    return { shas: [], success: true };
  }

  const validShas: string[] = [];
  for (const sha of shas) {
    if (sha.includes('..')) {
      validShas.push(sha);
      continue;
    }

    const exists = await gitClient.shaExists(repoPath, sha);
    if (!exists) {
      console.log(msg.cherryPickShaNotFound(sha));
      logger.error(`SHA ${sha} not found in repo history`, { repo: repoId, track });
    } else {
      validShas.push(sha);
    }
  }

  if (validShas.length === 0) {
    logger.warn('All SHAs were invalid, skipping cherry-pick', { repo: repoId, track });
    return { shas: [], success: true };
  }

  if (context.dryRun) {
    console.log(msg.dryRunSkip(`git cherry-pick ${validShas.join(' ')}`));
    logger.info(`[DRY-RUN] Would cherry-pick: ${validShas.join(' ')}`, { repo: repoId, track });
    return { shas: validShas, success: true };
  }

  for (const sha of validShas) {
    const isMerge = await gitClient.isMergeCommit(repoPath, sha);
    if (isMerge) {
      console.log(chalk.dim(`  Cherry-picking merge commit: ${sha} (using -m 1)`));
      logger.info(`Cherry-picking merge commit ${sha} with -m 1`, { repo: repoId, track });
    } else {
      console.log(chalk.dim(`  Cherry-picking revision: ${sha}`));
    }
    const result: CherryPickResult = await gitClient.cherryPick(repoPath, [sha]);

    if (result.success) {
      logger.info(`Cherry-picked ${sha}`, { repo: repoId, track });
      continue;
    }

    if (result.conflicting) {
      const conflictOutput = await gitClient.conflictFiles(repoPath);
      console.log(msg.cherryPickConflict(sha, conflictOutput));
      logger.warn(`Cherry-pick conflict on ${sha}`, { repo: repoId, track });

      while (true) {
        // Always re-print current conflict status so the engineer can see what's left.
        const currentConflicts = await gitClient.conflictFiles(repoPath);
        if (currentConflicts.trim()) {
          console.log(chalk.dim(`  Still conflicted:\n${currentConflicts.trim()}\n`));
        } else {
          const status = await gitClient.status(repoPath);
          if (status.trim()) {
            console.log(chalk.dim(`  Working tree status:\n${status.trim()}\n`));
          } else {
            console.log(chalk.dim('  Working tree clean.\n'));
          }
        }

        const action = await waitForUserAction();

        if (action === 'abort') {
          await gitClient.cherryPickAbort(repoPath);
          logger.warn(`Cherry-pick aborted by engineer on ${sha}`, { repo: repoId, track });
          return { shas: validShas, success: false, error: `Conflict on ${sha} — aborted` };
        }

        if (action === 'skip') {
          const skipResult = await gitClient.cherryPickSkip(repoPath);
          if (skipResult.success) {
            console.log(chalk.dim(`  Skipped ${sha}.`));
            logger.info(`Cherry-pick skipped for ${sha}`, { repo: repoId, track });
            break;
          }
          // If git reports there's nothing to skip, we likely already continued/aborted manually.
          if ((skipResult.error ?? '').includes('no cherry-pick or revert in progress')) {
            const alreadyCommitted = await gitClient.logContains(repoPath, sha);
            if (alreadyCommitted) {
              console.log(chalk.dim(`  Revision ${sha} already committed. Continuing...`));
              logger.info(`Revision ${sha} already in history after skip attempt`, { repo: repoId, track });
              break;
            }
          }
          console.log(chalk.dim(`  Unable to skip ${sha}.`));
          logger.warn(`Unable to skip ${sha}: ${skipResult.error}`, { repo: repoId, track });
          continue;
        }

        const continueResult = await gitClient.cherryPickContinue(repoPath);
        if (continueResult.success) {
          console.log(chalk.green('  Cherry-pick completed successfully.'));
          logger.info(`Cherry-pick conflict resolved for ${sha}`, { repo: repoId, track });
          break;
        }

        const errMsg = continueResult.error ?? '';
        if (
          errMsg.includes('nothing to commit') ||
          errMsg.includes('no changes') ||
          errMsg.includes('previous cherry-pick is now empty')
        ) {
          console.log(chalk.dim(`  Cherry-pick is empty after resolution. Skipping ${sha}...`));
          logger.warn(`Cherry-pick empty after resolution for ${sha}`, { repo: repoId, track, output: errMsg });
          await gitClient.cherryPickSkip(repoPath);
          break;
        }

        // Common case: user resolved and maybe completed it manually; simple-git now says "no cherry-pick..."
        if (errMsg.includes('no cherry-pick or revert in progress')) {
          const alreadyCommitted = await gitClient.logContains(repoPath, sha);
          if (alreadyCommitted) {
            console.log(chalk.dim(`  Revision ${sha} already committed. Continuing...`));
            logger.info(`Revision ${sha} already in history after continue reported no in-progress`, { repo: repoId, track });
            break;
          }
          console.log(chalk.dim('  No cherry-pick in progress, but revision not found in history. Aborting this commit.'));
          logger.warn(`No cherry-pick in progress after conflict on ${sha}, not in history`, { repo: repoId, track, output: errMsg });
          await gitClient.cherryPickAbort(repoPath);
          break;
        }

        if (continueResult.conflicting) {
          // Still conflicting — keep waiting for engineer to resolve/add.
          const newConflictOutput = await gitClient.conflictFiles(repoPath);
          if (newConflictOutput.trim()) console.log(newConflictOutput);
          continue;
        }

        // Non-conflict failure: abort just this commit and move on.
        console.log(chalk.dim(`  Cherry-pick --continue failed. Skipping ${sha}...`));
        logger.warn(`Cherry-pick --continue failed for ${sha}`, { repo: repoId, track, output: errMsg });
        await gitClient.cherryPickAbort(repoPath);
        break;
      }
    } else {
      logger.error(`Cherry-pick of ${sha} failed: ${result.error}`, { repo: repoId, track });
      return { shas: validShas, success: false, error: result.error };
    }
  }

  return { shas: validShas, success: true };
}
