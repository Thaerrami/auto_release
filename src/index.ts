import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { parseFlags } from './cli';
import { msg } from './messages';
import { Logger } from './logger';
import { RunStateManager } from './run-state';
import { LockManager } from './lock';
import { RealGitClient } from './git-client';
import { getRepoById, sortReposByDependencyOrder } from './config';
import {
  handleCrashRecovery,
  initRunContext,
  resolveReposFromContext,
  validateRepoPaths,
} from './startup';
import { repoReleaseFlow } from './repo-flow';

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const logger = new Logger(flags.logDir);
  logger.init();

  console.log(msg.banner());
  if (flags.dryRun) {
    console.log(msg.dryRunBanner());
  }
  if (flags.skipInstallBuild) {
    console.log(
      chalk.dim('  --skip-install-build: install and build are skipped for every repo (no prompts).\n')
    );
  }
  if (flags.autoPush) {
    console.log(
      chalk.dim('  --auto-push: after each diff summary, push runs without the push/skip/abort prompt.\n')
    );
  }

  const gitClient = new RealGitClient();
  const engineer = await gitClient.getConfigEmail(process.cwd());
  const runId = `${os.hostname()}-${process.pid}`;

  const stateManager = new RunStateManager(flags.logDir);
  const recoveryAction = await handleCrashRecovery(stateManager, logger);

  let selectedRepos;
  if (recoveryAction === 'resume') {
    // stateManager.load() has already been called inside handleCrashRecovery()
    const ids = stateManager.getSelectedRepoIds();
    selectedRepos = ids
      .map((id) => getRepoById(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    selectedRepos = sortReposByDependencyOrder(selectedRepos);
  } else {
    selectedRepos = await resolveReposFromContext(flags.repoOverride, logger);
  }

  const runStateFile = stateManager.getFilePath();
  if (recoveryAction !== 'resume') {
    stateManager.init(runId, engineer, flags.dryRun, selectedRepos.map((r) => r.id));
  }

  const context = initRunContext(flags, engineer, runId, runStateFile, selectedRepos);

  const validPaths = validateRepoPaths(selectedRepos, logger);
  if (!validPaths) {
    logger.flush();
    process.exit(1);
  }

  const lockManager = new LockManager(flags.lockPath);
  let lockAcquired = true;
  if (!flags.dryRun) {
    lockAcquired = await lockManager.acquire(
      {
        pid: process.pid,
        engineer,
        startedAt: context.startedAt,
        reposSelected: selectedRepos.map((r) => r.id),
      },
      logger
    );
  }
  if (!lockAcquired) {
    logger.flush();
    process.exit(1);
  }

  const results = [];
  let completedSuccessfully = false;
  try {
    for (const repo of selectedRepos) {
      if (repo.excludeFromRelease) {
        logger.info(`Repo excluded from release: ${repo.id}`, { repo: repo.id });
        continue;
      }
      const repoResult = await repoReleaseFlow(repo, context, gitClient, logger, stateManager);
      results.push(repoResult);
    }

    console.log(msg.runComplete());
    console.log(msg.runSummary(logger.getLogFilePath(), logger.getJsonFilePath()));
    completedSuccessfully = true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nFatal error: ${errMsg}\n`));
    logger.error(`Fatal error: ${errMsg}`);
    throw err;
  } finally {
    try {
      const runLog = logger.buildRunLog(runId, context.startedAt, engineer, flags.dryRun, results);
      logger.writeJsonLog(runLog);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to write JSON log: ${errMsg}`);
    }
    if (!flags.dryRun) {
      await lockManager.releaseLock(logger);
    }
    logger.flush();
  }

  // A successful run clears crash-recovery state (including when resuming).
  if (completedSuccessfully) {
    stateManager.cleanup();
  }
}

main().catch(() => {
  process.exit(1);
});

