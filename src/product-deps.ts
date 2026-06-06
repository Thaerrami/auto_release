import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import execa = require('execa');
import {
  GitClient,
  RepoResult,
  RunContext,
} from './types';
import {
  UI_PRODUCTS_PATH,
  getRepoById,
  PRODUCT_UPGRADEABLE_REPOS,
} from './config';
import { msg } from './messages';
import { Logger } from './logger';
import { parseTag, versionToTag, getTrackFromVersion } from './version';
import {
  buildGitSshDepValue,
  extractRepoIdFromGitSsh,
  extractVersionFromGitSsh,
  findDepInPackageJson,
  isGitSshFormat,
  replaceDepValueInRawPackageJson,
} from './dep-utils';

/** A repo/tag pair produced by the release run that products may depend on. */
export interface UpgradeTarget {
  repoId: string;
  depKey: string;
  track: string;
  newTag: string;
}

export interface ProductDepChange {
  depKey: string;
  repoId: string;
  oldValue: string;
  newValue: string;
  oldVersion: string;
  newVersion: string;
}

export interface ProductUpgradePlan {
  productId: string;
  packageJsonPath: string;
  changes: ProductDepChange[];
}

export interface ProductUpgradeResult {
  productId: string;
  status: 'success' | 'skipped' | 'failed';
  changes: ProductDepChange[];
  commitSha?: string;
  error?: string;
}

export interface ProductUpgradeSummary {
  plans: ProductUpgradePlan[];
  results: ProductUpgradeResult[];
  stashed: boolean;
}

/** Collect upgrade targets from tags pushed during this release run. */
export function collectUpgradeTargets(context: RunContext): UpgradeTarget[] {
  const targets: UpgradeTarget[] = [];

  for (const [repoId, tags] of context.tagsCreated) {
    const mapping = PRODUCT_UPGRADEABLE_REPOS[repoId];
    if (!mapping) continue;

    for (const tag of tags) {
      const parsed = parseTag(tag.startsWith('v') ? tag : `v${tag}`);
      if (!parsed) continue;
      targets.push({
        repoId,
        depKey: mapping.depKey,
        track: parsed.track,
        newTag: versionToTag(tag),
      });
    }
  }

  // ui-article bumped during theme/core release (not released as its own repo)
  if (
    context.articleUpgradeMode &&
    context.articleUpgradeMode !== 'none' &&
    !context.tagsCreated.has('ui-article')
  ) {
    if (context.articleUpgradeMode === 'single' && context.articleVersion) {
      targets.push({
        repoId: 'ui-article',
        depKey: 'ui-article',
        track: '*',
        newTag: versionToTag(context.articleVersion),
      });
    } else if (context.articleUpgradeMode === 'per-track' && context.articleVersionByTrack) {
      const uniqueVersions = [...new Set(Object.values(context.articleVersionByTrack))];
      if (uniqueVersions.length === 1) {
        targets.push({
          repoId: 'ui-article',
          depKey: 'ui-article',
          track: '*',
          newTag: versionToTag(uniqueVersions[0]),
        });
      }
    }
  }

  return targets;
}

/** Find all product package.json files (top-level and nested, max depth 2). */
export function findProductPackageJsonFiles(rootPath: string): string[] {
  if (!fs.existsSync(rootPath)) return [];

  const results: string[] = [];
  const skipDirs = new Set(['node_modules', 'widgets', 'templates', 'components', 'scss', 'js']);

  const topEntries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isDirectory() || skipDirs.has(entry.name)) continue;

    const topPkg = path.join(rootPath, entry.name, 'package.json');
    if (fs.existsSync(topPkg)) {
      results.push(topPkg);
    }

    const subRoot = path.join(rootPath, entry.name);
    let subEntries: fs.Dirent[];
    try {
      subEntries = fs.readdirSync(subRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const sub of subEntries) {
      if (!sub.isDirectory() || skipDirs.has(sub.name)) continue;
      const nestedPkg = path.join(subRoot, sub.name, 'package.json');
      if (fs.existsSync(nestedPkg)) {
        results.push(nestedPkg);
      }
    }
  }

  return results.sort();
}

function productIdFromPath(uiProductsRoot: string, packageJsonPath: string): string {
  return path.relative(uiProductsRoot, path.dirname(packageJsonPath)).replace(/\\/g, '/');
}

function targetMatchesDep(
  target: UpgradeTarget,
  depKey: string,
  depValue: string
): boolean {
  if (depKey !== target.depKey) return false;

  const repoFromUrl = extractRepoIdFromGitSsh(depValue);
  if (repoFromUrl !== target.repoId) return false;

  if (target.track === '*') return true;

  const currentVersion = extractVersionFromGitSsh(depValue);
  const track = getTrackFromVersion(currentVersion);
  if (!track) return false;

  return track === target.track;
}

function pickBestTarget(
  targets: UpgradeTarget[],
  depKey: string,
  depValue: string
): UpgradeTarget | null {
  const matching = targets.filter((t) => targetMatchesDep(t, depKey, depValue));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  return matching.reduce((best, t) => {
    const bestParsed = parseTag(best.newTag);
    const tParsed = parseTag(t.newTag);
    if (!bestParsed || !tParsed) return t;
    if (tParsed.patch > bestParsed.patch) return t;
    return best;
  });
}

/** Build upgrade plans for products affected by the release targets. */
export function buildProductUpgradePlans(
  targets: UpgradeTarget[],
  uiProductsRoot: string
): ProductUpgradePlan[] {
  if (targets.length === 0) return [];

  const plans: ProductUpgradePlan[] = [];
  const pkgPaths = findProductPackageJsonFiles(uiProductsRoot);

  for (const pkgPath of pkgPaths) {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkgJson = JSON.parse(raw) as Record<string, unknown>;
    const productId = productIdFromPath(uiProductsRoot, pkgPath);
    const changes: ProductDepChange[] = [];

    const depKeys = [...new Set(targets.map((t) => t.depKey))];
    for (const depKey of depKeys) {
      const found = findDepInPackageJson(pkgJson, depKey);
      if (!found) continue;

      const matchTarget = pickBestTarget(targets, depKey, found.value);
      if (!matchTarget) continue;

      const oldVersion = extractVersionFromGitSsh(found.value);
      const newVersion = extractVersionFromGitSsh(matchTarget.newTag);
      if (oldVersion === newVersion) continue;

      const repoConfig = getRepoById(matchTarget.repoId);
      const remoteUrl = repoConfig?.gitRemoteUrl ?? `git@github.com:atypon/${matchTarget.repoId}.git`;
      const newValue = isGitSshFormat(found.value)
        ? buildGitSshDepValue(remoteUrl, matchTarget.newTag)
        : newVersion;

      if (changes.some((c) => c.depKey === depKey)) continue;

      changes.push({
        depKey,
        repoId: matchTarget.repoId,
        oldValue: found.value,
        newValue,
        oldVersion,
        newVersion,
      });
    }

    if (changes.length > 0) {
      plans.push({ productId, packageJsonPath: pkgPath, changes });
    }
  }

  return plans.sort((a, b) => a.productId.localeCompare(b.productId));
}

export function isReleaseEligibleForProductUpgrade(
  results: RepoResult[],
  context: RunContext
): boolean {
  if (context.tagsCreated.size === 0) return false;
  const hasHardFailure = results.some((r) => r.status === 'failed');
  return !hasHardFailure;
}

function formatPlanSummary(plan: ProductUpgradePlan): string {
  const changeLines = plan.changes.map(
    (c) => `${c.depKey} (${c.repoId}): v${c.oldVersion} → v${c.newVersion}`
  );
  return `${plan.productId} — ${changeLines.join('; ')}`;
}

async function promptProductSelection(
  plans: ProductUpgradePlan[],
  autoUpgrade: boolean
): Promise<ProductUpgradePlan[]> {
  if (autoUpgrade) return plans;

  console.log(msg.productUpgradeListHeader(plans.length));
  for (const plan of plans) {
    console.log(msg.productUpgradePlanLine(formatPlanSummary(plan)));
  }
  console.log('');

  const { action } = await inquirer.prompt<{ action: string }>([{
    type: 'list',
    name: 'action',
    message: 'Product dependency upgrade:',
    choices: [
      { name: '[A] Upgrade all listed products', value: 'all' },
      { name: '[S] Select products individually', value: 'select' },
      { name: '[N] Skip product upgrades', value: 'skip' },
    ],
  }]);

  if (action === 'skip') return [];
  if (action === 'all') return plans;

  const { selected } = await inquirer.prompt<{ selected: string[] }>([{
    type: 'checkbox',
    name: 'selected',
    message: 'Select products to upgrade:',
    choices: plans.map((p) => ({
      name: formatPlanSummary(p),
      value: p.productId,
      checked: true,
    })),
    validate: (input: string[]) => (input.length > 0 ? true : 'Select at least one product'),
  }]);

  return plans.filter((p) => selected.includes(p.productId));
}

async function prepareUiProductsRepo(
  uiProductsPath: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger
): Promise<{ stashed: boolean; aborted: boolean }> {
  const repo = getRepoById('ui-products');
  if (!repo) return { stashed: false, aborted: true };

  console.log(msg.productUpgradePrep());

  if (context.dryRun) {
    console.log(msg.dryRunSkip(`git checkout ${repo.baseBranch} in ui-products`));
    console.log(msg.dryRunSkip('git stash (if dirty)'));
    return { stashed: false, aborted: false };
  }

  const status = await gitClient.status(uiProductsPath);
  let stashed = false;

  if (status.trim()) {
    console.log(msg.dirtyTree(status));
    const { action } = await inquirer.prompt<{ action: string }>([{
      type: 'list',
      name: 'action',
      message: 'ui-products has uncommitted changes. Choose action:',
      choices: [
        { name: '[S] Stash and continue', value: 'stash' },
        { name: '[A] Abort product upgrades', value: 'abort' },
      ],
    }]);

    if (action === 'abort') {
      logger.info('Product upgrade aborted due to dirty ui-products tree', {});
      return { stashed: false, aborted: true };
    }

    await gitClient.stash(uiProductsPath);
    stashed = true;
    logger.info('Stashed ui-products changes before product upgrade', {});
  }

  try {
    await gitClient.checkout(uiProductsPath, repo.baseBranch);
    logger.info(`Checked out ${repo.baseBranch} in ui-products`, {});
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`  Could not checkout ${repo.baseBranch}: ${errMsg}`));
    return { stashed, aborted: true };
  }

  try {
    await gitClient.pull(uiProductsPath);
    logger.info('Pulled latest ui-products changes', {});
  } catch (err) {
    logger.warn(
      `Pull failed for ui-products: ${err instanceof Error ? err.message : String(err)}`,
      {}
    );
  }

  return { stashed, aborted: false };
}

async function applyProductPlan(
  plan: ProductUpgradePlan,
  context: RunContext,
  gitClient: GitClient,
  uiProductsPath: string,
  runInstall: boolean,
  logger: Logger
): Promise<ProductUpgradeResult> {
  const result: ProductUpgradeResult = {
    productId: plan.productId,
    status: 'success',
    changes: plan.changes,
  };

  try {
    let raw = fs.readFileSync(plan.packageJsonPath, 'utf-8');

    for (const change of plan.changes) {
      console.log(msg.productDepBump(plan.productId, change.depKey, change.oldValue, change.newValue));

      if (context.dryRun) {
        console.log(msg.dryRunSkip(`Update ${change.depKey} in ${plan.packageJsonPath}`));
        continue;
      }

      raw = replaceDepValueInRawPackageJson(raw, change.depKey, change.oldValue, change.newValue);
    }

    if (!context.dryRun) {
      fs.writeFileSync(plan.packageJsonPath, raw, 'utf-8');

      if (runInstall) {
        const productDir = path.dirname(plan.packageJsonPath);
        console.log(msg.productInstallRunning(plan.productId));
        try {
          await execa('npm', ['install'], { cwd: productDir, stdio: context.verbose ? 'inherit' : 'pipe' });
        } catch (err) {
          logger.warn(
            `npm install failed for ${plan.productId}: ${err instanceof Error ? err.message : String(err)}`,
            {}
          );
          console.log(chalk.yellow(`  ⚠  npm install failed for ${plan.productId} — lockfile may be stale.`));
        }
      }

      const depSummary = plan.changes
        .map((c) => `${c.depKey} → v${c.newVersion}`)
        .join(', ');
      const relPath = path.relative(uiProductsPath, plan.packageJsonPath);
      await gitClient.add(uiProductsPath, [relPath]);

      const lockRel = path.relative(uiProductsPath, path.join(path.dirname(plan.packageJsonPath), 'package-lock.json'));
      if (fs.existsSync(path.join(uiProductsPath, lockRel))) {
        await gitClient.add(uiProductsPath, [lockRel]);
      }

      const commitMsg = `Upgrade ${depSummary} for ${plan.productId}`;
      await gitClient.commitAll(uiProductsPath, commitMsg);
      logger.info(`Committed product upgrade for ${plan.productId}`, {});
    }
  } catch (err) {
    result.status = 'failed';
    result.error = err instanceof Error ? err.message : String(err);
    logger.error(`Product upgrade failed for ${plan.productId}: ${result.error}`, {});
  }

  return result;
}

async function promptPushUiProducts(
  uiProductsPath: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger
): Promise<void> {
  if (context.dryRun) {
    console.log(msg.dryRunSkip('git push origin develop (ui-products)'));
    return;
  }

  const { push } = await inquirer.prompt<{ push: boolean }>([{
    type: 'confirm',
    name: 'push',
    message: 'Push ui-products commits to origin/develop?',
    default: false,
  }]);

  if (!push) return;

  const repo = getRepoById('ui-products');
  const branch = repo?.baseBranch ?? 'develop';
  const pushResult = await gitClient.push(uiProductsPath, branch);
  if (pushResult.success) {
    console.log(chalk.green(`  ✓ Pushed ui-products to origin/${branch}`));
    logger.info('Pushed ui-products after product upgrade', {});
  } else {
    console.log(chalk.red(`  ✗ Push failed: ${pushResult.error ?? 'unknown error'}`));
    logger.error(`ui-products push failed: ${pushResult.error}`, {});
  }
}

/** Main entry: offer and run product dependency upgrades after a successful release. */
export async function runProductDependencyUpgrades(
  context: RunContext,
  results: RepoResult[],
  gitClient: GitClient,
  logger: Logger,
  options: { skipProductUpgrade: boolean; autoUpgradeProducts: boolean; skipProductInstall: boolean }
): Promise<ProductUpgradeSummary | null> {
  if (options.skipProductUpgrade) {
    logger.info('Product upgrade skipped via --skip-product-upgrade', {});
    return null;
  }

  if (!isReleaseEligibleForProductUpgrade(results, context)) {
    logger.info('Release not eligible for product upgrade (no tags or hard failures)', {});
    return null;
  }

  const targets = collectUpgradeTargets(context);
  if (targets.length === 0) {
    console.log(msg.productUpgradeNoTargets());
    return null;
  }

  console.log(msg.productUpgradeTargetsHeader());
  for (const t of targets) {
    console.log(msg.productUpgradeTargetLine(t.repoId, t.track, t.newTag));
  }
  console.log('');

  const plans = buildProductUpgradePlans(targets, UI_PRODUCTS_PATH);
  if (plans.length === 0) {
    console.log(msg.productUpgradeNoProducts());
    return null;
  }

  const selectedPlans = await promptProductSelection(plans, options.autoUpgradeProducts);
  if (selectedPlans.length === 0) {
    console.log(msg.productUpgradeSkipped());
    return { plans, results: [], stashed: false };
  }

  const prep = await prepareUiProductsRepo(UI_PRODUCTS_PATH, context, gitClient, logger);
  if (prep.aborted) {
    return { plans: selectedPlans, results: [], stashed: prep.stashed };
  }

  let runInstall = !options.skipProductInstall;
  if (!options.autoUpgradeProducts && !context.dryRun) {
    const { install } = await inquirer.prompt<{ install: boolean }>([{
      type: 'confirm',
      name: 'install',
      message: 'Run npm install in each upgraded product (updates lockfiles)?',
      default: true,
    }]);
    runInstall = install;
  }

  const upgradeResults: ProductUpgradeResult[] = [];
  for (const plan of selectedPlans) {
    const result = await applyProductPlan(
      plan,
      context,
      gitClient,
      UI_PRODUCTS_PATH,
      runInstall,
      logger
    );
    upgradeResults.push(result);
  }

  console.log(msg.productUpgradeComplete(upgradeResults));

  const successCount = upgradeResults.filter((r) => r.status === 'success').length;
  if (successCount > 0 && !context.dryRun) {
    await promptPushUiProducts(UI_PRODUCTS_PATH, context, gitClient, logger);
  }

  return { plans: selectedPlans, results: upgradeResults, stashed: prep.stashed };
}
