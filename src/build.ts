import fs from 'fs';
import path from 'path';
import readline from 'readline';
import execa = require('execa');
import inquirer from 'inquirer';
import { RunContext } from './types';
import { msg } from './messages';
import { Logger } from './logger';

type PackageManager = 'npm' | 'yarn';

function detectPackageManager(repoPath: string): PackageManager {
  if (fs.existsSync(path.join(repoPath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

async function waitForRetryAction(): Promise<'retry' | 'skip' | 'abort'> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  > ', (answer) => {
      rl.close();
      const upper = answer.trim().toUpperCase();
      if (upper === 'ABORT') {
        resolve('abort');
      } else if (upper === 'SKIP') {
        resolve('skip');
      } else {
        resolve('retry');
      }
    });
  });
}

async function promptRunStep(promptMsg: string): Promise<boolean> {
  const { run } = await inquirer.prompt<{ run: string }>([{
    type: 'list',
    name: 'run',
    message: promptMsg,
    choices: [
      { name: '[Y] Yes, run it', value: 'yes' },
      { name: '[S] Skip', value: 'skip' },
    ],
  }]);
  return run === 'yes';
}

export async function runInstall(
  repoPath: string,
  repoId: string,
  track: string,
  context: RunContext,
  logger: Logger
): Promise<{ success: boolean; skipped: boolean; aborted: boolean }> {
  if (context.dryRun) {
    const pm = detectPackageManager(repoPath);
    console.log(msg.dryRunSkip(`${pm} install`));
    logger.info(`[DRY-RUN] Would run ${pm} install`, { repo: repoId, track });
    return { success: true, skipped: false, aborted: false };
  }

  if (context.skipInstallBuild) {
    logger.info('npm install skipped (--skip-install-build)', { repo: repoId, track });
    return { success: true, skipped: true, aborted: false };
  }

  const shouldRun = await promptRunStep('Run npm install?');
  if (!shouldRun) {
    logger.info('npm install skipped by engineer', { repo: repoId, track });
    return { success: true, skipped: true, aborted: false };
  }

  const pm = detectPackageManager(repoPath);
  const installCmd = pm === 'yarn' ? 'yarn' : 'npm';
  const installArgs = pm === 'yarn' ? ['install'] : ['install'];

  while (true) {
    console.log(msg.installRunning(repoId));
    try {
      const result = await execa(installCmd, installArgs, {
        cwd: repoPath,
        stdio: context.verbose ? 'inherit' : 'pipe',
        reject: true,
      });
      if (!context.verbose && result.stdout) {
        logger.debug(`${pm} install output`, { repo: repoId, track, output: result.stdout });
      }
      logger.info(`${pm} install succeeded`, { repo: repoId, track });
      return { success: true, skipped: false, aborted: false };
    } catch (err) {
      const errOutput = err instanceof Error ? (err as NodeJS.ErrnoException).message : String(err);
      console.log(msg.installFailed(errOutput));
      logger.error(`${pm} install failed`, { repo: repoId, track, output: errOutput });

      const action = await waitForRetryAction();
      if (action === 'abort') {
        logger.warn(`${pm} install aborted by engineer`, { repo: repoId, track });
        return { success: false, skipped: false, aborted: true };
      }
      if (action === 'skip') {
        logger.warn(`${pm} install skipped after failure`, { repo: repoId, track });
        return { success: false, skipped: true, aborted: false };
      }
    }
  }
}

export async function runBuild(
  repoPath: string,
  repoId: string,
  track: string,
  context: RunContext,
  logger: Logger
): Promise<{ success: boolean; skipped: boolean; aborted: boolean }> {
  if (context.dryRun) {
    const pm = detectPackageManager(repoPath);
    console.log(msg.dryRunSkip(`${pm} run build`));
    logger.info(`[DRY-RUN] Would run ${pm} run build`, { repo: repoId, track });
    return { success: true, skipped: false, aborted: false };
  }

  if (context.skipInstallBuild) {
    logger.info('npm build skipped (--skip-install-build)', { repo: repoId, track });
    return { success: true, skipped: true, aborted: false };
  }

  const shouldRun = await promptRunStep('Run npm run build?');
  if (!shouldRun) {
    logger.info('npm build skipped by engineer', { repo: repoId, track });
    return { success: true, skipped: true, aborted: false };
  }

  const pm = detectPackageManager(repoPath);
  const buildCmd = pm === 'yarn' ? 'yarn' : 'npm';
  const buildArgs = pm === 'yarn' ? ['build'] : ['run', 'build'];

  while (true) {
    console.log(msg.buildRunning(repoId));
    try {
      const result = await execa(buildCmd, buildArgs, {
        cwd: repoPath,
        stdio: context.verbose ? 'inherit' : 'pipe',
        reject: true,
      });
      if (!context.verbose && result.stdout) {
        logger.debug(`${pm} build output`, { repo: repoId, track, output: result.stdout });
      }
      logger.info(`${pm} build succeeded`, { repo: repoId, track });
      return { success: true, skipped: false, aborted: false };
    } catch (err) {
      const errOutput = err instanceof Error ? (err as NodeJS.ErrnoException).message : String(err);
      console.log(msg.buildFailed(errOutput));
      logger.error(`${pm} build failed`, { repo: repoId, track, output: errOutput });

      const action = await waitForRetryAction();
      if (action === 'abort') {
        logger.warn(`${pm} build aborted by engineer`, { repo: repoId, track });
        return { success: false, skipped: false, aborted: true };
      }
      if (action === 'skip') {
        logger.warn(`${pm} build skipped after failure`, { repo: repoId, track });
        return { success: false, skipped: true, aborted: false };
      }
    }
  }
}
