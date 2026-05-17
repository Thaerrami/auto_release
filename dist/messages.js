"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.msg = void 0;
exports.setColorEnabled = setColorEnabled;
const chalk_1 = __importDefault(require("chalk"));
let colorEnabled = true;
function setColorEnabled(enabled) {
    colorEnabled = enabled;
}
function c(fn, text) {
    return colorEnabled ? fn(text) : text;
}
exports.msg = {
    banner: () => c(chalk_1.default.cyan.bold, '\n╔══════════════════════════════════════════╗\n') +
        c(chalk_1.default.cyan.bold, '║        Release Management Tool           ║\n') +
        c(chalk_1.default.cyan.bold, '╚══════════════════════════════════════════╝\n'),
    dryRunBanner: () => c(chalk_1.default.yellow.bold, '\n⚠  DRY-RUN MODE — no writes will be executed\n'),
    pathValidation: (repoId, absPath, exists) => exists
        ? `  ${c(chalk_1.default.green, '✓')} ${repoId}: ${c(chalk_1.default.dim, absPath)}`
        : `  ${c(chalk_1.default.red, '✗')} ${repoId}: ${c(chalk_1.default.red, absPath)} — ${c(chalk_1.default.red.bold, 'NOT FOUND')}`,
    missingPaths: () => c(chalk_1.default.red.bold, '\nOne or more repo paths are missing. Cannot continue.\n'),
    lockHeld: (engineer, time, repos) => c(chalk_1.default.yellow.bold, '\n⚠  Release tool is currently running\n') +
        `   By: ${c(chalk_1.default.white.bold, engineer)}\n` +
        `   Since: ${c(chalk_1.default.white, time)}\n` +
        `   Repos: ${c(chalk_1.default.white, repos.join(', '))}\n`,
    lockActions: () => `\n  [W] Wait (poll every 10s)  [F] Force override  [A] Abort\n`,
    repoSelect: () => c(chalk_1.default.cyan.bold, '\nSelect repos for this release run:\n'),
    layerWarning: (child, parent) => c(chalk_1.default.yellow, `\n⚠  ${child} (layer 3) selected without parent ${parent} (layer 2).\n`) +
        `   Parent was not released in this run. Proceed anyway?`,
    processingRepo: (repoId) => c(chalk_1.default.cyan.bold, `\n${'═'.repeat(60)}\n`) +
        c(chalk_1.default.cyan.bold, `  Processing: ${repoId}\n`) +
        c(chalk_1.default.cyan.bold, `${'═'.repeat(60)}\n`),
    dirtyTree: (files) => c(chalk_1.default.yellow.bold, '\n⚠  Working tree has uncommitted changes:\n') + files,
    dirtyActions: () => `\n  [S] Stash  [P] Proceed with warning  [A] Abort this repo\n`,
    trackSelect: (repoId) => c(chalk_1.default.cyan, `\nSelect version tracks for ${repoId}:\n`),
    trackSelectOnce: () => c(chalk_1.default.cyan, '\nSelect version tracks (used for all repos in this run):\n'),
    trackInfo: (track, latest, date) => `${track} — latest: ${c(chalk_1.default.white.bold, latest)} (${c(chalk_1.default.dim, date)})`,
    newTrackOption: () => '+ Enter new track manually',
    computedTag: (track, newTag) => `  ${c(chalk_1.default.green, '→')} Track ${c(chalk_1.default.white.bold, track)}: next tag = ${c(chalk_1.default.green.bold, newTag)}`,
    tagExists: (tag, location) => c(chalk_1.default.yellow, `\n⚠  Tag ${tag} already exists ${location}.\n`) +
        `  [D] Delete and recreate  [C] Enter custom version  [S] Skip this track\n`,
    patchWarning: (patch) => c(chalk_1.default.yellow, `\n⚠  Patch version ${patch} exceeds 999. This is unusual.\n`) +
        `  [C] Confirm  [E] Enter custom version\n`,
    depBump: (depId, pkgKey, oldVer, newVer) => `  ${c(chalk_1.default.blue, '↑')} Bumping ${pkgKey} (${depId}): ${c(chalk_1.default.red, oldVer)} → ${c(chalk_1.default.green, newVer)}`,
    depKeyMissing: (depId, pkgKey, availableKeys) => c(chalk_1.default.yellow, `\n⚠  Dependency key "${pkgKey}" not found in package.json for ${depId}.\n`) +
        `   Available keys: ${availableKeys.join(', ')}\n`,
    depVersionDrift: (pkgKey, current, newVer) => c(chalk_1.default.yellow, `\n⚠  Current version of ${pkgKey} is ${current}, which is ahead of new tag ${newVer}.\n`) +
        `   Overwrite?`,
    cherryPickPrompt: () => `\nEnter commit SHAs to cherry-pick (space-separated, SHA..SHA range, or empty to skip): `,
    cherryPickPromptAll: () => `\nCommits to cherry-pick in every repo (all tracks). Space-separated or empty for none: `,
    cherryPickRepoExtraPrompt: (repoId) => `\nAdditional commits only for ${c(chalk_1.default.white.bold, repoId)} (after the global list; space-separated or empty): `,
    cherryPickShaNotFound: (sha) => c(chalk_1.default.yellow, `  ⚠  SHA ${sha} not found in repo history — skipping`),
    cherryPickConflict: (sha, files) => c(chalk_1.default.red.bold, `\n✗  Cherry-pick conflict on ${sha}:\n`) +
        files +
        c(chalk_1.default.yellow, '\n  Resolve conflicts in your editor, run "git add <files>",\n') +
        c(chalk_1.default.yellow, '  then press ENTER to continue, type SKIP to skip this commit, or ABORT to cancel this track.\n'),
    installPrompt: () => `\n  Run npm install? [Y] Yes  [S] Skip  `,
    installRunning: (repoId) => `  Running npm install in ${repoId}...`,
    installFailed: (output) => c(chalk_1.default.red.bold, '\n✗  npm install failed:\n') +
        output +
        c(chalk_1.default.yellow, '\n  Press ENTER to retry, type SKIP to skip, or ABORT to cancel this repo.\n'),
    buildPrompt: () => `\n  Run npm run build? [Y] Yes  [S] Skip  `,
    buildRunning: (repoId) => `  Running npm run build in ${repoId}...`,
    buildFailed: (output) => c(chalk_1.default.red.bold, '\n✗  npm run build failed:\n') +
        output +
        c(chalk_1.default.yellow, '\n  Press ENTER to retry, type SKIP to skip, or ABORT to cancel this repo.\n'),
    pushRejected: (errorType) => {
        switch (errorType) {
            case 'non-fast-forward':
                return c(chalk_1.default.yellow, '  ⚠  Push rejected (non-fast-forward). Offer: git pull --rebase and retry.');
            case 'auth':
                return c(chalk_1.default.red, '  ✗  Auth error. Check your GitHub token / SSH key configuration.');
            case 'protected-branch':
                return c(chalk_1.default.yellow, '  ⚠  Protected branch. Push via PR instead. Marking as manual.');
            case 'timeout':
                return c(chalk_1.default.yellow, '  ⚠  Network timeout.');
            default:
                return c(chalk_1.default.red, `  ✗  Push failed: ${errorType}`);
        }
    },
    stashPopFailed: (stashList) => c(chalk_1.default.yellow.bold, '\n⚠  git stash pop failed.\n') +
        `   Stash list:\n${stashList}\n` +
        c(chalk_1.default.yellow, '   Your changes are still in the stash. Manually resolve.\n'),
    uiBaseDirectWarning: () => c(chalk_1.default.yellow, '\n⚠  ui-base cannot be used directly in products — only via ui-core or ui-theme-*.\n'),
    remoteNotSet: (repoId) => c(chalk_1.default.yellow, `\n⚠  Remote "origin" not set for ${repoId}.\n`),
    dryRunSkip: (command) => c(chalk_1.default.yellow, `  [DRY-RUN] Would have run: ${command}`),
    resumePrompt: (runId, startedAt, completedCount) => c(chalk_1.default.cyan, `\nFound incomplete run from ${startedAt} (${runId}).\n`) +
        `   ${completedCount} steps completed.\n` +
        `   [R] Resume  [F] Fresh start  [V] View completed steps\n`,
    versionMismatchWarning: (tracks) => c(chalk_1.default.yellow, `\n⚠  Main-group repos have mismatched tracks selected: ${tracks.join(', ')}\n`) +
        `   All main-versioned repos should share the same major.minor. Proceed anyway?`,
    runComplete: () => c(chalk_1.default.green.bold, '\n✓  Release run complete.\n'),
    runSummary: (logPath, jsonPath) => `  Logs: ${c(chalk_1.default.dim, logPath)}\n  JSON: ${c(chalk_1.default.dim, jsonPath)}\n`,
    articleCascade: () => c(chalk_1.default.cyan, '\n  Post-article: Cascading ui-article version into consuming repos...\n'),
    articleCascadeRepo: (repoId, track, newTag) => `  ${c(chalk_1.default.blue, '↑')} ${repoId} track ${track}: would create tag ${c(chalk_1.default.green, newTag)}`,
    legacyTestPrefix: (tag) => c(chalk_1.default.yellow, `\n  ⚠  Legacy behavior: tag would be created as "${tag}" (test prefix from UpgradeTheme2.sh bug)\n`),
    consumeThemesBeforeDefine: () => c(chalk_1.default.yellow, '  ⚠  [legacy-bug] consumeThemes() invoked before function definition — would fail at runtime in bash\n'),
    eurekaSpecialMode: (majors) => c(chalk_1.default.dim, `  [eureka-special] Processing major versions: ${majors}\n`),
    childCherryPickPrompt: (repoId) => exports.msg.cherryPickRepoExtraPrompt(repoId),
    articleUpgradePrompt: () => c(chalk_1.default.cyan, '\nUpgrade ui-article in consuming repos (core/themes)?\n') +
        '  [N] No — leave ui-article as-is in package.json\n' +
        '  [S] Yes — single version for all tracks (e.g. v6.6.6)\n' +
        '  [P] Per-track — map each track to a ui-article version\n',
    articleVersionSingle: () => '  Enter ui-article version/tag for all tracks (e.g. v6.6.6): ',
    articleVersionForTrack: (track) => `  ui-article version for track ${track} (e.g. v6.6.6, or empty to skip): `,
};
//# sourceMappingURL=messages.js.map