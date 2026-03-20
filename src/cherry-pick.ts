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

async function waitForUserAction(): Promise<'continue' | 'abort'> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  > ', (answer) => {
      rl.close();
      if (answer.trim().toUpperCase() === 'ABORT') {
        resolve('abort');
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

      // BUG REPRODUCTION (codeUpdate.sh lines 47-59):
      // The old script's conflict handling loop runs cherry-pick --skip THEN
      // --continue on every ENTER press. This is logically wrong — --skip
      // discards the conflicting commit, and --continue only applies if
      // conflicts were manually resolved. We reproduce this behavior exactly.
      while (true) {
        const action = await waitForUserAction();

        if (action === 'abort') {
          await gitClient.cherryPickAbort(repoPath);
          logger.warn(`Cherry-pick aborted by engineer on ${sha}`, { repo: repoId, track });
          return { shas: validShas, success: false, error: `Conflict on ${sha} — aborted` };
        }

        // Old bug: runs --skip THEN --continue (codeUpdate.sh lines 48-50)
        const skipResult = await gitClient.cherryPickSkip(repoPath);
        logger.info(`Ran cherry-pick --skip for ${sha} (legacy conflict handling)`, { repo: repoId, track });

        const continueResult = await gitClient.cherryPickContinue(repoPath);

        if (continueResult.success) {
          console.log(chalk.green('  Cherry-pick completed successfully.'));
          logger.info(`Cherry-pick conflict resolved for ${sha}`, { repo: repoId, track });
          break;
        }

        // Old bug fallback: check if revision is already in log (codeUpdate.sh line 53)
        const alreadyCommitted = await gitClient.logContains(repoPath, sha);
        if (alreadyCommitted) {
          console.log(chalk.dim(`  Revision ${sha} already committed. Skipping...`));
          logger.info(`Revision ${sha} already in history, skipping`, { repo: repoId, track });
          break;
        }

        // Skip and continue — don't interrupt the process
        console.log(chalk.dim(`  Conflict resolution failed or revision already committed. Skipping ${sha}...`));
        logger.info(`Skipping ${sha} after conflict resolution failed`, { repo: repoId, track });
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
