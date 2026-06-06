"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectUpgradeTargets = collectUpgradeTargets;
exports.findProductPackageJsonFiles = findProductPackageJsonFiles;
exports.buildProductUpgradePlans = buildProductUpgradePlans;
exports.isReleaseEligibleForProductUpgrade = isReleaseEligibleForProductUpgrade;
exports.runProductDependencyUpgrades = runProductDependencyUpgrades;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const execa = require("execa");
const config_1 = require("./config");
const messages_1 = require("./messages");
const version_1 = require("./version");
const dep_utils_1 = require("./dep-utils");
/** Collect upgrade targets from tags pushed during this release run. */
function collectUpgradeTargets(context) {
    const targets = [];
    for (const [repoId, tags] of context.tagsCreated) {
        const mapping = config_1.PRODUCT_UPGRADEABLE_REPOS[repoId];
        if (!mapping)
            continue;
        for (const tag of tags) {
            const parsed = (0, version_1.parseTag)(tag.startsWith('v') ? tag : `v${tag}`);
            if (!parsed)
                continue;
            targets.push({
                repoId,
                depKey: mapping.depKey,
                track: parsed.track,
                newTag: (0, version_1.versionToTag)(tag),
            });
        }
    }
    // ui-article bumped during theme/core release (not released as its own repo)
    if (context.articleUpgradeMode &&
        context.articleUpgradeMode !== 'none' &&
        !context.tagsCreated.has('ui-article')) {
        if (context.articleUpgradeMode === 'single' && context.articleVersion) {
            targets.push({
                repoId: 'ui-article',
                depKey: 'ui-article',
                track: '*',
                newTag: (0, version_1.versionToTag)(context.articleVersion),
            });
        }
        else if (context.articleUpgradeMode === 'per-track' && context.articleVersionByTrack) {
            const uniqueVersions = [...new Set(Object.values(context.articleVersionByTrack))];
            if (uniqueVersions.length === 1) {
                targets.push({
                    repoId: 'ui-article',
                    depKey: 'ui-article',
                    track: '*',
                    newTag: (0, version_1.versionToTag)(uniqueVersions[0]),
                });
            }
        }
    }
    return targets;
}
/** Find all product package.json files (top-level and nested, max depth 2). */
function findProductPackageJsonFiles(rootPath) {
    if (!fs_1.default.existsSync(rootPath))
        return [];
    const results = [];
    const skipDirs = new Set(['node_modules', 'widgets', 'templates', 'components', 'scss', 'js']);
    const topEntries = fs_1.default.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of topEntries) {
        if (!entry.isDirectory() || skipDirs.has(entry.name))
            continue;
        const topPkg = path_1.default.join(rootPath, entry.name, 'package.json');
        if (fs_1.default.existsSync(topPkg)) {
            results.push(topPkg);
        }
        const subRoot = path_1.default.join(rootPath, entry.name);
        let subEntries;
        try {
            subEntries = fs_1.default.readdirSync(subRoot, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const sub of subEntries) {
            if (!sub.isDirectory() || skipDirs.has(sub.name))
                continue;
            const nestedPkg = path_1.default.join(subRoot, sub.name, 'package.json');
            if (fs_1.default.existsSync(nestedPkg)) {
                results.push(nestedPkg);
            }
        }
    }
    return results.sort();
}
function productIdFromPath(uiProductsRoot, packageJsonPath) {
    return path_1.default.relative(uiProductsRoot, path_1.default.dirname(packageJsonPath)).replace(/\\/g, '/');
}
function targetMatchesDep(target, depKey, depValue) {
    if (depKey !== target.depKey)
        return false;
    const repoFromUrl = (0, dep_utils_1.extractRepoIdFromGitSsh)(depValue);
    if (repoFromUrl !== target.repoId)
        return false;
    if (target.track === '*')
        return true;
    const currentVersion = (0, dep_utils_1.extractVersionFromGitSsh)(depValue);
    const track = (0, version_1.getTrackFromVersion)(currentVersion);
    if (!track)
        return false;
    return track === target.track;
}
function pickBestTarget(targets, depKey, depValue) {
    const matching = targets.filter((t) => targetMatchesDep(t, depKey, depValue));
    if (matching.length === 0)
        return null;
    if (matching.length === 1)
        return matching[0];
    return matching.reduce((best, t) => {
        const bestParsed = (0, version_1.parseTag)(best.newTag);
        const tParsed = (0, version_1.parseTag)(t.newTag);
        if (!bestParsed || !tParsed)
            return t;
        if (tParsed.patch > bestParsed.patch)
            return t;
        return best;
    });
}
/** Build upgrade plans for products affected by the release targets. */
function buildProductUpgradePlans(targets, uiProductsRoot) {
    if (targets.length === 0)
        return [];
    const plans = [];
    const pkgPaths = findProductPackageJsonFiles(uiProductsRoot);
    for (const pkgPath of pkgPaths) {
        const raw = fs_1.default.readFileSync(pkgPath, 'utf-8');
        const pkgJson = JSON.parse(raw);
        const productId = productIdFromPath(uiProductsRoot, pkgPath);
        const changes = [];
        const depKeys = [...new Set(targets.map((t) => t.depKey))];
        for (const depKey of depKeys) {
            const found = (0, dep_utils_1.findDepInPackageJson)(pkgJson, depKey);
            if (!found)
                continue;
            const matchTarget = pickBestTarget(targets, depKey, found.value);
            if (!matchTarget)
                continue;
            const oldVersion = (0, dep_utils_1.extractVersionFromGitSsh)(found.value);
            const newVersion = (0, dep_utils_1.extractVersionFromGitSsh)(matchTarget.newTag);
            if (oldVersion === newVersion)
                continue;
            const repoConfig = (0, config_1.getRepoById)(matchTarget.repoId);
            const remoteUrl = repoConfig?.gitRemoteUrl ?? `git@github.com:atypon/${matchTarget.repoId}.git`;
            const newValue = (0, dep_utils_1.isGitSshFormat)(found.value)
                ? (0, dep_utils_1.buildGitSshDepValue)(remoteUrl, matchTarget.newTag)
                : newVersion;
            if (changes.some((c) => c.depKey === depKey))
                continue;
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
function isReleaseEligibleForProductUpgrade(results, context) {
    if (context.tagsCreated.size === 0)
        return false;
    const hasHardFailure = results.some((r) => r.status === 'failed');
    return !hasHardFailure;
}
function formatPlanSummary(plan) {
    const changeLines = plan.changes.map((c) => `${c.depKey} (${c.repoId}): v${c.oldVersion} → v${c.newVersion}`);
    return `${plan.productId} — ${changeLines.join('; ')}`;
}
async function promptProductSelection(plans, autoUpgrade) {
    if (autoUpgrade)
        return plans;
    console.log(messages_1.msg.productUpgradeListHeader(plans.length));
    for (const plan of plans) {
        console.log(messages_1.msg.productUpgradePlanLine(formatPlanSummary(plan)));
    }
    console.log('');
    const { action } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'action',
            message: 'Product dependency upgrade:',
            choices: [
                { name: '[A] Upgrade all listed products', value: 'all' },
                { name: '[S] Select products individually', value: 'select' },
                { name: '[N] Skip product upgrades', value: 'skip' },
            ],
        }]);
    if (action === 'skip')
        return [];
    if (action === 'all')
        return plans;
    const { selected } = await inquirer_1.default.prompt([{
            type: 'checkbox',
            name: 'selected',
            message: 'Select products to upgrade:',
            choices: plans.map((p) => ({
                name: formatPlanSummary(p),
                value: p.productId,
                checked: true,
            })),
            validate: (input) => (input.length > 0 ? true : 'Select at least one product'),
        }]);
    return plans.filter((p) => selected.includes(p.productId));
}
async function prepareUiProductsRepo(uiProductsPath, context, gitClient, logger) {
    const repo = (0, config_1.getRepoById)('ui-products');
    if (!repo)
        return { stashed: false, aborted: true };
    console.log(messages_1.msg.productUpgradePrep());
    if (context.dryRun) {
        console.log(messages_1.msg.dryRunSkip(`git checkout ${repo.baseBranch} in ui-products`));
        console.log(messages_1.msg.dryRunSkip('git stash (if dirty)'));
        return { stashed: false, aborted: false };
    }
    const status = await gitClient.status(uiProductsPath);
    let stashed = false;
    if (status.trim()) {
        console.log(messages_1.msg.dirtyTree(status));
        const { action } = await inquirer_1.default.prompt([{
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
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.log(chalk_1.default.red(`  Could not checkout ${repo.baseBranch}: ${errMsg}`));
        return { stashed, aborted: true };
    }
    try {
        await gitClient.pull(uiProductsPath);
        logger.info('Pulled latest ui-products changes', {});
    }
    catch (err) {
        logger.warn(`Pull failed for ui-products: ${err instanceof Error ? err.message : String(err)}`, {});
    }
    return { stashed, aborted: false };
}
async function applyProductPlan(plan, context, gitClient, uiProductsPath, runInstall, logger) {
    const result = {
        productId: plan.productId,
        status: 'success',
        changes: plan.changes,
    };
    try {
        let raw = fs_1.default.readFileSync(plan.packageJsonPath, 'utf-8');
        for (const change of plan.changes) {
            console.log(messages_1.msg.productDepBump(plan.productId, change.depKey, change.oldValue, change.newValue));
            if (context.dryRun) {
                console.log(messages_1.msg.dryRunSkip(`Update ${change.depKey} in ${plan.packageJsonPath}`));
                continue;
            }
            raw = (0, dep_utils_1.replaceDepValueInRawPackageJson)(raw, change.depKey, change.oldValue, change.newValue);
        }
        if (!context.dryRun) {
            fs_1.default.writeFileSync(plan.packageJsonPath, raw, 'utf-8');
            if (runInstall) {
                const productDir = path_1.default.dirname(plan.packageJsonPath);
                console.log(messages_1.msg.productInstallRunning(plan.productId));
                try {
                    await execa('npm', ['install'], { cwd: productDir, stdio: context.verbose ? 'inherit' : 'pipe' });
                }
                catch (err) {
                    logger.warn(`npm install failed for ${plan.productId}: ${err instanceof Error ? err.message : String(err)}`, {});
                    console.log(chalk_1.default.yellow(`  ⚠  npm install failed for ${plan.productId} — lockfile may be stale.`));
                }
            }
            const depSummary = plan.changes
                .map((c) => `${c.depKey} → v${c.newVersion}`)
                .join(', ');
            const relPath = path_1.default.relative(uiProductsPath, plan.packageJsonPath);
            await gitClient.add(uiProductsPath, [relPath]);
            const lockRel = path_1.default.relative(uiProductsPath, path_1.default.join(path_1.default.dirname(plan.packageJsonPath), 'package-lock.json'));
            if (fs_1.default.existsSync(path_1.default.join(uiProductsPath, lockRel))) {
                await gitClient.add(uiProductsPath, [lockRel]);
            }
            const commitMsg = `Upgrade ${depSummary} for ${plan.productId}`;
            await gitClient.commitAll(uiProductsPath, commitMsg);
            logger.info(`Committed product upgrade for ${plan.productId}`, {});
        }
    }
    catch (err) {
        result.status = 'failed';
        result.error = err instanceof Error ? err.message : String(err);
        logger.error(`Product upgrade failed for ${plan.productId}: ${result.error}`, {});
    }
    return result;
}
async function promptPushUiProducts(uiProductsPath, context, gitClient, logger) {
    if (context.dryRun) {
        console.log(messages_1.msg.dryRunSkip('git push origin develop (ui-products)'));
        return;
    }
    const { push } = await inquirer_1.default.prompt([{
            type: 'confirm',
            name: 'push',
            message: 'Push ui-products commits to origin/develop?',
            default: false,
        }]);
    if (!push)
        return;
    const repo = (0, config_1.getRepoById)('ui-products');
    const branch = repo?.baseBranch ?? 'develop';
    const pushResult = await gitClient.push(uiProductsPath, branch);
    if (pushResult.success) {
        console.log(chalk_1.default.green(`  ✓ Pushed ui-products to origin/${branch}`));
        logger.info('Pushed ui-products after product upgrade', {});
    }
    else {
        console.log(chalk_1.default.red(`  ✗ Push failed: ${pushResult.error ?? 'unknown error'}`));
        logger.error(`ui-products push failed: ${pushResult.error}`, {});
    }
}
/** Main entry: offer and run product dependency upgrades after a successful release. */
async function runProductDependencyUpgrades(context, results, gitClient, logger, options) {
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
        console.log(messages_1.msg.productUpgradeNoTargets());
        return null;
    }
    console.log(messages_1.msg.productUpgradeTargetsHeader());
    for (const t of targets) {
        console.log(messages_1.msg.productUpgradeTargetLine(t.repoId, t.track, t.newTag));
    }
    console.log('');
    const plans = buildProductUpgradePlans(targets, config_1.UI_PRODUCTS_PATH);
    if (plans.length === 0) {
        console.log(messages_1.msg.productUpgradeNoProducts());
        return null;
    }
    const selectedPlans = await promptProductSelection(plans, options.autoUpgradeProducts);
    if (selectedPlans.length === 0) {
        console.log(messages_1.msg.productUpgradeSkipped());
        return { plans, results: [], stashed: false };
    }
    const prep = await prepareUiProductsRepo(config_1.UI_PRODUCTS_PATH, context, gitClient, logger);
    if (prep.aborted) {
        return { plans: selectedPlans, results: [], stashed: prep.stashed };
    }
    let runInstall = !options.skipProductInstall;
    if (!options.autoUpgradeProducts && !context.dryRun) {
        const { install } = await inquirer_1.default.prompt([{
                type: 'confirm',
                name: 'install',
                message: 'Run npm install in each upgraded product (updates lockfiles)?',
                default: true,
            }]);
        runInstall = install;
    }
    const upgradeResults = [];
    for (const plan of selectedPlans) {
        const result = await applyProductPlan(plan, context, gitClient, config_1.UI_PRODUCTS_PATH, runInstall, logger);
        upgradeResults.push(result);
    }
    console.log(messages_1.msg.productUpgradeComplete(upgradeResults));
    const successCount = upgradeResults.filter((r) => r.status === 'success').length;
    if (successCount > 0 && !context.dryRun) {
        await promptPushUiProducts(config_1.UI_PRODUCTS_PATH, context, gitClient, logger);
    }
    return { plans: selectedPlans, results: upgradeResults, stashed: prep.stashed };
}
//# sourceMappingURL=product-deps.js.map