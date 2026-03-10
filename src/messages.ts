import chalk from 'chalk';

let colorEnabled = true;

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

function c(fn: (s: string) => string, text: string): string {
  return colorEnabled ? fn(text) : text;
}

export const msg = {
  banner: () =>
    c(chalk.cyan.bold, '\n╔══════════════════════════════════════════╗\n') +
    c(chalk.cyan.bold, '║        Release Management Tool           ║\n') +
    c(chalk.cyan.bold, '╚══════════════════════════════════════════╝\n'),

  dryRunBanner: () => c(chalk.yellow.bold, '\n⚠  DRY-RUN MODE — no writes will be executed\n'),

  pathValidation: (repoId: string, absPath: string, exists: boolean) =>
    exists
      ? `  ${c(chalk.green, '✓')} ${repoId}: ${c(chalk.dim, absPath)}`
      : `  ${c(chalk.red, '✗')} ${repoId}: ${c(chalk.red, absPath)} — ${c(chalk.red.bold, 'NOT FOUND')}`,

  missingPaths: () => c(chalk.red.bold, '\nOne or more repo paths are missing. Cannot continue.\n'),

  lockHeld: (engineer: string, time: string, repos: string[]) =>
    c(chalk.yellow.bold, '\n⚠  Release tool is currently running\n') +
    `   By: ${c(chalk.white.bold, engineer)}\n` +
    `   Since: ${c(chalk.white, time)}\n` +
    `   Repos: ${c(chalk.white, repos.join(', '))}\n`,

  lockActions: () => `\n  [W] Wait (poll every 10s)  [F] Force override  [A] Abort\n`,

  repoSelect: () => c(chalk.cyan.bold, '\nSelect repos for this release run:\n'),

  layerWarning: (child: string, parent: string) =>
    c(chalk.yellow, `\n⚠  ${child} (layer 3) selected without parent ${parent} (layer 2).\n`) +
    `   Parent was not released in this run. Proceed anyway?`,

  processingRepo: (repoId: string) =>
    c(chalk.cyan.bold, `\n${'═'.repeat(60)}\n`) +
    c(chalk.cyan.bold, `  Processing: ${repoId}\n`) +
    c(chalk.cyan.bold, `${'═'.repeat(60)}\n`),

  dirtyTree: (files: string) =>
    c(chalk.yellow.bold, '\n⚠  Working tree has uncommitted changes:\n') + files,

  dirtyActions: () => `\n  [S] Stash  [P] Proceed with warning  [A] Abort this repo\n`,

  trackSelect: (repoId: string) =>
    c(chalk.cyan, `\nSelect version tracks for ${repoId}:\n`),

  trackSelectOnce: () =>
    c(chalk.cyan, '\nSelect version tracks (used for all repos in this run):\n'),

  trackInfo: (track: string, latest: string, date: string) =>
    `${track} — latest: ${c(chalk.white.bold, latest)} (${c(chalk.dim, date)})`,

  newTrackOption: () => '+ Enter new track manually',

  computedTag: (track: string, newTag: string) =>
    `  ${c(chalk.green, '→')} Track ${c(chalk.white.bold, track)}: next tag = ${c(chalk.green.bold, newTag)}`,

  tagExists: (tag: string, location: string) =>
    c(chalk.yellow, `\n⚠  Tag ${tag} already exists ${location}.\n`) +
    `  [D] Delete and recreate  [C] Enter custom version  [S] Skip this track\n`,

  patchWarning: (patch: number) =>
    c(chalk.yellow, `\n⚠  Patch version ${patch} exceeds 999. This is unusual.\n`) +
    `  [C] Confirm  [E] Enter custom version\n`,

  depBump: (depId: string, pkgKey: string, oldVer: string, newVer: string) =>
    `  ${c(chalk.blue, '↑')} Bumping ${pkgKey} (${depId}): ${c(chalk.red, oldVer)} → ${c(chalk.green, newVer)}`,

  depKeyMissing: (depId: string, pkgKey: string, availableKeys: string[]) =>
    c(chalk.yellow, `\n⚠  Dependency key "${pkgKey}" not found in package.json for ${depId}.\n`) +
    `   Available keys: ${availableKeys.join(', ')}\n`,

  depVersionDrift: (pkgKey: string, current: string, newVer: string) =>
    c(chalk.yellow, `\n⚠  Current version of ${pkgKey} is ${current}, which is ahead of new tag ${newVer}.\n`) +
    `   Overwrite?`,

  cherryPickPrompt: () =>
    `\nEnter commit SHAs to cherry-pick (space-separated, SHA..SHA range, or empty to skip): `,

  cherryPickPromptAll: () =>
    `\nEnter commit SHAs to cherry-pick (used for all repos/tracks). Space-separated, or empty to skip: `,

  cherryPickShaNotFound: (sha: string) =>
    c(chalk.yellow, `  ⚠  SHA ${sha} not found in repo history — skipping`),

  cherryPickConflict: (sha: string, files: string) =>
    c(chalk.red.bold, `\n✗  Cherry-pick conflict on ${sha}:\n`) +
    files +
    c(chalk.yellow, '\n  Resolve conflicts in your editor, run "git add <files>",\n') +
    c(chalk.yellow, '  then press ENTER to continue, or type ABORT to cancel this track.\n'),

  installPrompt: () =>
    `\n  Run npm install? [Y] Yes  [S] Skip  `,

  installRunning: (repoId: string) => `  Running npm install in ${repoId}...`,

  installFailed: (output: string) =>
    c(chalk.red.bold, '\n✗  npm install failed:\n') +
    output +
    c(chalk.yellow, '\n  Press ENTER to retry, type SKIP to skip, or ABORT to cancel this repo.\n'),

  buildPrompt: () =>
    `\n  Run npm run build? [Y] Yes  [S] Skip  `,

  buildRunning: (repoId: string) => `  Running npm run build in ${repoId}...`,

  buildFailed: (output: string) =>
    c(chalk.red.bold, '\n✗  npm run build failed:\n') +
    output +
    c(chalk.yellow, '\n  Press ENTER to retry, type SKIP to skip, or ABORT to cancel this repo.\n'),

  pushRejected: (errorType: string) => {
    switch (errorType) {
      case 'non-fast-forward':
        return c(chalk.yellow, '  ⚠  Push rejected (non-fast-forward). Offer: git pull --rebase and retry.');
      case 'auth':
        return c(chalk.red, '  ✗  Auth error. Check your GitHub token / SSH key configuration.');
      case 'protected-branch':
        return c(chalk.yellow, '  ⚠  Protected branch. Push via PR instead. Marking as manual.');
      case 'timeout':
        return c(chalk.yellow, '  ⚠  Network timeout.');
      default:
        return c(chalk.red, `  ✗  Push failed: ${errorType}`);
    }
  },

  stashPopFailed: (stashList: string) =>
    c(chalk.yellow.bold, '\n⚠  git stash pop failed.\n') +
    `   Stash list:\n${stashList}\n` +
    c(chalk.yellow, '   Your changes are still in the stash. Manually resolve.\n'),

  uiBaseDirectWarning: () =>
    c(chalk.yellow, '\n⚠  ui-base cannot be used directly in products — only via ui-core or ui-theme-*.\n'),

  remoteNotSet: (repoId: string) =>
    c(chalk.yellow, `\n⚠  Remote "origin" not set for ${repoId}.\n`),

  dryRunSkip: (command: string) =>
    c(chalk.yellow, `  [DRY-RUN] Would have run: ${command}`),

  resumePrompt: (runId: string, startedAt: string, completedCount: number) =>
    c(chalk.cyan, `\nFound incomplete run from ${startedAt} (${runId}).\n`) +
    `   ${completedCount} steps completed.\n` +
    `   [R] Resume  [F] Fresh start  [V] View completed steps\n`,

  versionMismatchWarning: (tracks: string[]) =>
    c(chalk.yellow, `\n⚠  Main-group repos have mismatched tracks selected: ${tracks.join(', ')}\n`) +
    `   All main-versioned repos should share the same major.minor. Proceed anyway?`,

  runComplete: () => c(chalk.green.bold, '\n✓  Release run complete.\n'),

  runSummary: (logPath: string, jsonPath: string) =>
    `  Logs: ${c(chalk.dim, logPath)}\n  JSON: ${c(chalk.dim, jsonPath)}\n`,

  articleCascade: () =>
    c(chalk.cyan, '\n  Post-article: Cascading ui-article version into consuming repos...\n'),

  articleCascadeRepo: (repoId: string, track: string, newTag: string) =>
    `  ${c(chalk.blue, '↑')} ${repoId} track ${track}: would create tag ${c(chalk.green, newTag)}`,

  legacyTestPrefix: (tag: string) =>
    c(chalk.yellow, `\n  ⚠  Legacy behavior: tag would be created as "${tag}" (test prefix from UpgradeTheme2.sh bug)\n`),

  consumeThemesBeforeDefine: () =>
    c(chalk.yellow, '  ⚠  [legacy-bug] consumeThemes() invoked before function definition — would fail at runtime in bash\n'),

  eurekaSpecialMode: (majors: string) =>
    c(chalk.dim, `  [eureka-special] Processing major versions: ${majors}\n`),

  childCherryPickPrompt: (repoId: string) =>
    `\nEnter cherry-pick SHAs for ${c(chalk.white.bold, repoId)} (space-separated, or empty to skip): `,

  articleUpgradePrompt: () =>
    c(chalk.cyan, '\nUpgrade ui-article in consuming repos (core/themes)?\n') +
    '  [N] No — leave ui-article as-is in package.json\n' +
    '  [S] Yes — single version for all tracks (e.g. v6.6.6)\n' +
    '  [P] Per-track — map each track to a ui-article version\n',

  articleVersionSingle: () =>
    '  Enter ui-article version/tag for all tracks (e.g. v6.6.6): ',

  articleVersionForTrack: (track: string) =>
    `  ui-article version for track ${track} (e.g. v6.6.6, or empty to skip): `,
};
