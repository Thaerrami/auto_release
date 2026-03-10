"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRepoPaths = validateRepoPaths;
exports.resolveReposFromContext = resolveReposFromContext;
exports.selectRepos = selectRepos;
exports.handleCrashRecovery = handleCrashRecovery;
exports.validateMainVersionTracks = validateMainVersionTracks;
exports.printDryRunSummary = printDryRunSummary;
exports.initRunContext = initRunContext;
const fs_1 = __importDefault(require("fs"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("./config");
const messages_1 = require("./messages");
function validateRepoPaths(repos, logger) {
    let allValid = true;
    for (const repo of repos) {
        const exists = fs_1.default.existsSync(repo.localPath);
        console.log(messages_1.msg.pathValidation(repo.id, repo.localPath, exists));
        logger.info(`Path check: ${repo.id} → ${repo.localPath} (${exists ? 'OK' : 'MISSING'})`);
        if (!exists)
            allValid = false;
    }
    if (!allValid) {
        console.log(messages_1.msg.missingPaths());
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
async function resolveReposFromContext(repoOverride, logger) {
    let standingRepo = null;
    if (repoOverride) {
        standingRepo = (0, config_1.getRepoById)(repoOverride) ?? null;
        if (!standingRepo) {
            console.log(chalk_1.default.red(`\n  Error: --repo "${repoOverride}" does not match any known repo.`));
            console.log(chalk_1.default.dim(`  Known repos: ${config_1.REPOS.map((r) => r.id).join(', ')}\n`));
            logger.error(`Unknown repo override: ${repoOverride}`);
            process.exit(1);
        }
        logger.info(`Repo override via --repo flag: ${standingRepo.id}`);
    }
    else {
        const cwd = process.cwd();
        standingRepo = (0, config_1.detectStandingRepo)(cwd);
        if (!standingRepo) {
            console.log(chalk_1.default.yellow(`\n  Could not detect repo from CWD: ${cwd}`));
            console.log(chalk_1.default.dim(`  Falling back to manual selection.\n`));
            logger.warn(`CWD ${cwd} does not match any known repo, falling back to prompt`);
            return promptRepoSelection(logger);
        }
        logger.info(`Detected standing repo from CWD: ${standingRepo.id} (${cwd})`);
    }
    const tree = (0, config_1.getRepoAndDescendants)(standingRepo);
    console.log(chalk_1.default.cyan.bold(`\n  Standing repo: ${standingRepo.id}`));
    console.log(chalk_1.default.cyan(`  Release tree (${tree.length} repos):\n`));
    for (const repo of tree) {
        const indent = repo.id === standingRepo.id ? '  → ' : '    ';
        const depInfo = repo.deps.length > 0 ? chalk_1.default.dim(` (depends on: ${repo.deps.join(', ')})`) : '';
        console.log(`${indent}${chalk_1.default.white.bold(repo.id)}${depInfo}`);
    }
    console.log('');
    return tree;
}
async function promptRepoSelection(logger) {
    console.log(messages_1.msg.repoSelect());
    const choices = config_1.REPOS.map((r) => ({
        name: `${r.id} (layer ${r.layer}, ${r.versioning})`,
        value: r.id,
    }));
    const { selectedIds } = await inquirer_1.default.prompt([{
            type: 'checkbox',
            name: 'selectedIds',
            message: 'Select repos:',
            choices,
            validate: (input) => {
                if (input.length === 0)
                    return 'Select at least one repo';
                return true;
            },
        }]);
    const selected = selectedIds.map((id) => (0, config_1.getRepoById)(id)).filter((r) => r !== undefined);
    await validateSelection(selected, logger);
    return (0, config_1.sortReposByDependencyOrder)(selected);
}
/**
 * Old selectRepos kept for resume / manual fallback. Now re-exported as
 * promptRepoSelection internally; the public API is resolveReposFromContext.
 */
async function selectRepos(logger) {
    return promptRepoSelection(logger);
}
async function validateSelection(selected, logger) {
    const selectedIds = new Set(selected.map((r) => r.id));
    for (const repo of selected) {
        if (repo.layer === 3) {
            for (const depId of repo.deps) {
                const parent = (0, config_1.getRepoById)(depId);
                if (parent && parent.layer === 2 && !selectedIds.has(depId)) {
                    console.log(messages_1.msg.layerWarning(repo.id, depId));
                    const { proceed } = await inquirer_1.default.prompt([{
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
async function handleCrashRecovery(stateManager, logger) {
    if (!stateManager.existsFromPreviousRun())
        return null;
    const prevState = stateManager.load();
    if (!prevState) {
        stateManager.cleanup();
        return null;
    }
    console.log(messages_1.msg.resumePrompt(prevState.runId, prevState.startedAt, stateManager.getCompletedCount()));
    const { action } = await inquirer_1.default.prompt([{
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
        console.log(chalk_1.default.cyan('\nCompleted steps:'));
        for (const step of steps) {
            const status = step.result === 'success' ? chalk_1.default.green('✓') : chalk_1.default.yellow(step.result);
            console.log(`  ${status} ${step.repoId} / ${step.track} / ${step.step} (${step.timestamp})`);
            if (step.detail)
                console.log(`    → ${step.detail}`);
        }
        const { resumeAfterView } = await inquirer_1.default.prompt([{
                type: 'list',
                name: 'resumeAfterView',
                message: 'Choose action:',
                choices: [
                    { name: '[R] Resume', value: 'resume' },
                    { name: '[F] Fresh start', value: 'fresh' },
                ],
            }]);
        return resumeAfterView;
    }
    if (action === 'fresh') {
        stateManager.cleanup();
        return 'fresh';
    }
    return 'resume';
}
function validateMainVersionTracks(selectedRepos, tracksPerRepo) {
    const mainRepos = selectedRepos.filter((r) => r.versioning === 'main');
    if (mainRepos.length <= 1)
        return [];
    const allTracks = new Set();
    for (const repo of mainRepos) {
        const tracks = tracksPerRepo.get(repo.id) ?? [];
        for (const t of tracks)
            allTracks.add(t);
    }
    return Array.from(allTracks);
}
function printDryRunSummary(selectedRepos, results, context) {
    console.log(chalk_1.default.yellow.bold('\n╔══════════════════════════════════════════╗'));
    console.log(chalk_1.default.yellow.bold('║        DRY-RUN SUMMARY                  ║'));
    console.log(chalk_1.default.yellow.bold('╚══════════════════════════════════════════╝\n'));
    for (const result of results) {
        const repo = selectedRepos.find((r) => r.id === result.repoId);
        if (!repo)
            continue;
        console.log(chalk_1.default.cyan.bold(`  ${result.repoId}:`));
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
function initRunContext(flags, engineer, runId, runStateFile, selectedRepos) {
    if (flags.noColor) {
        (0, messages_1.setColorEnabled)(false);
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
//# sourceMappingURL=startup.js.map