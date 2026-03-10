import inquirer from 'inquirer';
import { GitClient, RunContext, PushResult } from './types';
import { msg } from './messages';
import { Logger } from './logger';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pushChanges(
  repoPath: string,
  repoId: string,
  track: string,
  branch: string,
  newTag: string,
  gitClient: GitClient,
  context: RunContext,
  logger: Logger,
  tagAlreadyCreated = false
): Promise<{ success: boolean; manual: boolean }> {
  if (context.dryRun) {
    if (!tagAlreadyCreated) {
      console.log(msg.dryRunSkip(`git tag ${newTag}`));
    }
    console.log(msg.dryRunSkip(`git push origin ${newTag}`));
    logger.info(`[DRY-RUN] Would push tag ${newTag}`, { repo: repoId, track });
    return { success: true, manual: false };
  }

  if (!tagAlreadyCreated) {
    await gitClient.tagCreate(repoPath, newTag);
    logger.info(`Tag ${newTag} created locally`, { repo: repoId, track });
  }

  // When we're in detached HEAD (e.g. checked out a tag for hotfix), skip branch push — only push the tag.
  const isDetachedHead = branch === 'HEAD';
  let branchResult = { success: true, manual: false as boolean };
  if (!isDetachedHead) {
    branchResult = await pushWithRetry(
      () => gitClient.push(repoPath, branch),
      repoPath,
      repoId,
      track,
      branch,
      'branch',
      gitClient,
      logger
    );
    if (!branchResult.success && !branchResult.manual) {
      logger.error(`Push of ${branch} failed`, { repo: repoId, track });
      return branchResult;
    }
    if (branchResult.manual) {
      logger.warn(`Push of ${branch} marked as manual (protected branch)`, { repo: repoId, track });
    }
  } else {
    logger.info(`Detached HEAD — pushing tag only (no branch push)`, { repo: repoId, track });
  }

  const tagResult = await pushWithRetry(
    () => gitClient.pushTag(repoPath, newTag),
    repoPath,
    repoId,
    track,
    newTag,
    'tag',
    gitClient,
    logger
  );

  if (!tagResult.success) {
    if (tagResult.manual) {
      logger.warn(`Push of tag ${newTag} marked as manual`, { repo: repoId, track });
    } else {
      logger.error(`Push of tag ${newTag} failed`, { repo: repoId, track });
    }
  }

  return {
    success: branchResult.success || branchResult.manual,
    manual: branchResult.manual || tagResult.manual,
  };
}

async function pushWithRetry(
  pushFn: () => Promise<PushResult>,
  repoPath: string,
  repoId: string,
  track: string,
  ref: string,
  refType: 'branch' | 'tag',
  gitClient: GitClient,
  logger: Logger
): Promise<{ success: boolean; manual: boolean }> {
  let result = await pushFn();

  if (result.success) {
    logger.info(`Pushed ${refType} ${ref}`, { repo: repoId, track });
    return { success: true, manual: false };
  }

  console.log(msg.pushRejected(result.errorType ?? 'unknown'));

  switch (result.errorType) {
    case 'non-fast-forward': {
      const { doRebase } = await inquirer.prompt<{ doRebase: boolean }>([{
        type: 'confirm',
        name: 'doRebase',
        message: 'Run git pull --rebase and retry?',
        default: true,
      }]);

      if (doRebase && refType === 'branch') {
        try {
          await gitClient.pullRebase(repoPath, ref);
          logger.info(`Rebased ${ref}`, { repo: repoId, track });
          result = await pushFn();
          if (result.success) {
            logger.info(`Pushed ${refType} ${ref} after rebase`, { repo: repoId, track });
            return { success: true, manual: false };
          }
        } catch (err) {
          logger.error(`Rebase failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repoId, track });
        }
      }
      return { success: false, manual: false };
    }

    case 'auth':
      console.log('  Check your GitHub token / SSH key configuration.');
      console.log('  For HTTPS: ensure GH_TOKEN or GITHUB_TOKEN is set.');
      console.log('  For SSH: ensure ssh-agent has your key loaded.');
      logger.error('Auth error pushing', { repo: repoId, track });
      await inquirer.prompt([{ type: 'input', name: 'pause', message: 'Press ENTER to continue after fixing auth...' }]);
      result = await pushFn();
      return { success: result.success, manual: false };

    case 'protected-branch':
      logger.warn(`Protected branch — marking as manual`, { repo: repoId, track });
      return { success: false, manual: true };

    case 'timeout': {
      const backoffs = [2000, 4000, 8000];
      for (const delay of backoffs) {
        console.log(`  Retrying in ${delay / 1000}s...`);
        await sleep(delay);
        result = await pushFn();
        if (result.success) {
          logger.info(`Pushed ${refType} ${ref} after timeout retry`, { repo: repoId, track });
          return { success: true, manual: false };
        }
      }
      console.log('  All retries exhausted.');
      logger.error('Push timed out after all retries', { repo: repoId, track });
      await inquirer.prompt([{ type: 'input', name: 'pause', message: 'Press ENTER after fixing network...' }]);
      result = await pushFn();
      return { success: result.success, manual: false };
    }

    default:
      logger.error(`Push failed: ${result.error}`, { repo: repoId, track });
      return { success: false, manual: false };
  }
}
