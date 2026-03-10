import fs from 'fs';
import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  REPOS,
  sortReposByDependencyOrder,
  getRepoById,
  detectStandingRepo,
  getRepoAndDescendants,
} from './config';
import { RepoConfig, RunContext, RepoResult } from './types';
import { msg, setColorEnabled } from './messages';
import { Logger } from './logger';
import { RunStateManager } from './run-state';

export function validateRepoPaths(repos: RepoConfig[], logger: Logger): boolean {
  let allValid = true;
  for (const repo of repos) {
    const exists = fs.existsSync(repo.localPath);
    console.log(msg.pathValidation(repo.id, repo.localPath, exists));
    logger.info(`Path check: ${repo.id} → ${repo.localPath} (${exists ? 'OK' : 'MISSING'})`);
    if (!exists) allValid = false;
  }
  if (!allValid) {
    console.log(msg.missingPaths());
  }
  return allValid;
}

/**
 * Detect the standing repo from CWD or --repo flag, then resolve the full
 * subtree (the repo + all its children/grandchildren).
 *
 * This matches the old codeUpdate.sh behavior:
 *   repo_name=$(basename "$(git rev-parse --show-toplevel)")
 *   if [ "$repo_name" = "ui-article" ]; then ... else ... UpgradeTheme2.sh ...
 *
 * The old script always started from the CWD repo and cascaded downward.
 *
 * Examples:
 *   CWD = ui-core  → processes: ui-core, ui-theme-photo, ui-theme-classic (hotfix: no ui-base, ui-products, ui-theme-nextgen)
 *   CWD = ui-base  → processes: ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic (no ui-products)
 *   CWD = ui-theme-photo → processes: ui-theme-photo (leaf, no children)
 *   CWD = ui-article → processes: ui-article (independent, no children)
 */
export async function resolveReposFromContext(
  repoOverride: string | null,
  logger: Logger
): Promise<RepoConfig[]> {
  let standingRepo: RepoConfig | null = null;

  if (repoOverride) {
    standingRepo = getRepoById(repoOverride) ?? null;
    if (!standingRepo) {
      console.log(chalk.red(`\n  Error: --repo "${repoOverride}" does not match any known repo.`));
      console.log(chalk.dim(`  Known repos: ${REPOS.map((r) => r.id).join(', ')}\n`));
      logger.error(`Unknown repo override: ${repoOverride}`);
      process.exit(1);
    }
    logger.info(`Repo override via --repo flag: ${standingRepo.id}`);
  } else {
    const cwd = process.cwd();
    standingRepo = detectStandingRepo(cwd);

    if (!standingRepo) {
      console.log(chalk.yellow(`\n  Could not detect repo from CWD: ${cwd}`));
      console.log(chalk.dim(`  Falling back to manual selection.\n`));
      logger.warn(`CWD ${cwd} does not match any known repo, falling back to prompt`);
      return promptRepoSelection(logger);
    }

    logger.info(`Detected standing repo from CWD: ${standingRepo.id} (${cwd})`);
  }

  const tree = getRepoAndDescendants(standingRepo);

  console.log(chalk.cyan.bold(`\n  Standing repo: ${standingRepo.id}`));
  console.log(chalk.cyan(`  Release tree (${tree.length} repos):\n`));
  for (const repo of tree) {
    const indent = repo.id === standingRepo.id ? '  → ' : '    ';
    const depInfo = repo.deps.length > 0 ? chalk.dim(` (depends on: ${repo.deps.join(', ')})`) : '';
    console.log(`${indent}${chalk.white.bold(repo.id)}${depInfo}`);
  }
  console.log('');

  return tree;
}

async function promptRepoSelection(logger: Logger): Promise<RepoConfig[]> {
  console.log(msg.repoSelect());

  const choices = REPOS.map((r) => ({
    name: `${r.id} (layer ${r.layer}, ${r.versioning})`,
    value: r.id,
  }));

  const { selectedIds } = await inquirer.prompt<{ selectedIds: string[] }>([{
    type: 'checkbox',
    name: 'selectedIds',
    message: 'Select repos:',
    choices,
    validate: (input: string[]) => {
      if (input.length === 0) return 'Select at least one repo';
      return true;
    },
  }]);

  const selected = selectedIds.map((id) => getRepoById(id)).filter((r): r is RepoConfig => r !== undefined);

  await validateSelection(selected, logger);

  return sortReposByDependencyOrder(selected);
}

/**
 * Old selectRepos kept for resume / manual fallback. Now re-exported as
 * promptRepoSelection internally; the public API is resolveReposFromContext.
 */
export async function selectRepos(logger: Logger): Promise<RepoConfig[]> {
  return promptRepoSelection(logger);
}

async function validateSelection(selected: RepoConfig[], logger: Logger): Promise<void> {
  const selectedIds = new Set(selected.map((r) => r.id));

  for (const repo of selected) {
    if (repo.layer === 3) {
      for (const depId of repo.deps) {
        const parent = getRepoById(depId);
        if (parent && parent.layer === 2 && !selectedIds.has(depId)) {
          console.log(msg.layerWarning(repo.id, depId));
          const { proceed } = await inquirer.prompt<{ proceed: boolean }>([{
            type: 'confirm',
            name: 'proceed',
            message: 'Proceed without parent?',
            default: false,
          }]);
          if (!proceed) {
            logger.warn(`Engineer declined to proceed without parent ${depId} for ${repo.id}`);
          }
        }
      }
    }
  }

  const mainRepos = selected.filter((r) => r.versioning === 'main');
  if (mainRepos.length > 1) {
    logger.info(`Multiple main-versioned repos selected: ${mainRepos.map((r) => r.id).join(', ')}`);
  }
}

export async function handleCrashRecovery(
  stateManager: RunStateManager,
  logger: Logger
): Promise<'resume' | 'fresh' | null> {
  if (!stateManager.existsFromPreviousRun()) return null;

  const prevState = stateManager.load();
  if (!prevState) {
    stateManager.cleanup();
    return null;
  }

  console.log(msg.resumePrompt(prevState.runId, prevState.startedAt, stateManager.getCompletedCount()));

  const { action } = await inquirer.prompt<{ action: string }>([{
    type: 'list',
    name: 'action',
    message: 'Choose action:',
    choices: [
      { name: '[R] Resume from last completed step', value: 'resume' },
      { name: '[F] Fresh start (discard previous run)', value: 'fresh' },
      { name: '[V] View completed steps', value: 'view' },
    ],
  }]);

  if (action === 'view') {
    const steps = stateManager.getCompletedSteps();
    console.log(chalk.cyan('\nCompleted steps:'));
    for (const step of steps) {
      const status = step.result === 'success' ? chalk.green('✓') : chalk.yellow(step.result);
      console.log(`  ${status} ${step.repoId} / ${step.track} / ${step.step} (${step.timestamp})`);
      if (step.detail) console.log(`    → ${step.detail}`);
    }

    const { resumeAfterView } = await inquirer.prompt<{ resumeAfterView: string }>([{
      type: 'list',
      name: 'resumeAfterView',
      message: 'Choose action:',
      choices: [
        { name: '[R] Resume', value: 'resume' },
        { name: '[F] Fresh start', value: 'fresh' },
      ],
    }]);

    return resumeAfterView as 'resume' | 'fresh';
  }

  if (action === 'fresh') {
    stateManager.cleanup();
    return 'fresh';
  }

  return 'resume';
}

export function validateMainVersionTracks(
  selectedRepos: RepoConfig[],
  tracksPerRepo: Map<string, string[]>
): string[] {
  const mainRepos = selectedRepos.filter((r) => r.versioning === 'main');
  if (mainRepos.length <= 1) return [];

  const allTracks = new Set<string>();
  for (const repo of mainRepos) {
    const tracks = tracksPerRepo.get(repo.id) ?? [];
    for (const t of tracks) allTracks.add(t);
  }

  return Array.from(allTracks);
}

export function printDryRunSummary(
  selectedRepos: RepoConfig[],
  results: RepoResult[],
  context: RunContext
): void {
  console.log(chalk.yellow.bold('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.yellow.bold('║        DRY-RUN SUMMARY                  ║'));
  console.log(chalk.yellow.bold('╚══════════════════════════════════════════╝\n'));

  for (const result of results) {
    const repo = selectedRepos.find((r) => r.id === result.repoId);
    if (!repo) continue;

    console.log(chalk.cyan.bold(`  ${result.repoId}:`));
    console.log(`    Tracks: ${result.tracksProcessed.join(', ') || 'none'}`);
    console.log(`    Tags that would be created: ${result.tagsCreated.join(', ') || 'none'}`);
    console.log(`    Cherry-picks: ${result.cherryPicks.join(', ') || 'none'}`);

    const depEntries = Object.entries(result.depsBumped);
    if (depEntries.length > 0) {
      console.log('    Dep bumps:');
      for (const [dep, ver] of depEntries) {
        console.log(`      ${dep} → ${ver}`);
      }
    }
    console.log(`    Status: ${result.status}`);
    console.log('');
  }
}

export function initRunContext(
  flags: { dryRun: boolean; verbose: boolean; noColor: boolean; logDir: string; lockPath: string },
  engineer: string,
  runId: string,
  runStateFile: string,
  selectedRepos: RepoConfig[]
): RunContext {
  if (flags.noColor) {
    setColorEnabled(false);
  }

  return {
    dryRun: flags.dryRun,
    verbose: flags.verbose,
    noColor: flags.noColor,
    tagsCreated: new Map(),
    logEntries: [],
    runStateFile,
    logDir: flags.logDir,
    lockPath: flags.lockPath,
    engineer,
    runId,
    startedAt: new Date().toISOString(),
    selectedRepos,
  };
}
