import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  RepoConfig,
  RunContext,
  GitClient,
  TrackResult,
  RepoResult,
  TagInfo,
} from './types';
import { msg } from './messages';
import { Logger } from './logger';
import { RunStateManager } from './run-state';
import {
  groupTagsByTrack,
  getLatestInTrack,
  computeNextTag,
  parseTag,
} from './version';
import { bumpParentDependency } from './dep-bump';
import { performCherryPicks } from './cherry-pick';
import { runInstall, runBuild } from './build';
import { showDiffSummary } from './diff-summary';
import { pushChanges } from './push';

export async function repoReleaseFlow(
  repo: RepoConfig,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger,
  stateManager: RunStateManager
): Promise<RepoResult> {
  const result: RepoResult = {
    repoId: repo.id,
    tracksProcessed: [],
    tagsCreated: [],
    cherryPicks: [],
    depsBumped: {},
    errors: [],
    status: 'success',
    stashed: false,
  };

  console.log(msg.processingRepo(repo.id));
  logger.info(`Processing repo: ${repo.id}`, { repo: repo.id });

  if (repo.id === 'ui-base') {
    console.log(msg.uiBaseDirectWarning());
    logger.warn('ui-base selected — reminder: cannot be used directly in products', { repo: repo.id });
  }

  const hasOrigin = await gitClient.remoteExists(repo.localPath, 'origin');
  if (!hasOrigin) {
    console.log(msg.remoteNotSet(repo.id));
    const { setRemoteUrl } = await inquirer.prompt<{ setRemoteUrl: string }>([{
      type: 'input',
      name: 'setRemoteUrl',
      message: 'Enter remote URL for origin (or press Enter to skip):',
    }]);
    if (setRemoteUrl) {
      if (!context.dryRun) {
        await gitClient.setRemote(repo.localPath, 'origin', setRemoteUrl);
        logger.info(`Set remote origin to ${setRemoteUrl}`, { repo: repo.id });
      } else {
        console.log(msg.dryRunSkip(`git remote add origin ${setRemoteUrl}`));
      }
    } else {
      logger.warn('No remote origin set — pushes will fail', { repo: repo.id });
    }
  }

  // Step 0: Checkout base branch, pull, fetch tags (matches old codeUpdate.sh lines 10-14)
  if (!context.dryRun) {
    try {
      await gitClient.checkout(repo.localPath, repo.baseBranch);
      logger.info(`Checked out ${repo.baseBranch}`, { repo: repo.id });
    } catch (err) {
      logger.warn(`Could not checkout ${repo.baseBranch}: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id });
    }
    try {
      await gitClient.pull(repo.localPath);
      logger.info('Pulled latest changes', { repo: repo.id });
    } catch (err) {
      logger.warn(`Pull failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id });
    }
    try {
      await gitClient.fetchTags(repo.localPath);
      logger.info('Fetched tags from remote', { repo: repo.id });
    } catch (err) {
      logger.warn(`Fetch tags failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id });
    }
  } else {
    console.log(msg.dryRunSkip(`git checkout ${repo.baseBranch}`));
    console.log(msg.dryRunSkip('git pull'));
    console.log(msg.dryRunSkip('git fetch --tags'));
  }

  // Step 1: Dirty working tree check
  const dirtyAction = await handleDirtyTree(repo, context, gitClient, logger, stateManager);
  if (dirtyAction === 'abort') {
    result.status = 'skipped';
    logger.info('Repo skipped due to dirty tree', { repo: repo.id });
    return result;
  }
  if (dirtyAction === 'stash') {
    result.stashed = true;
  }

  // Step 2: Version track selection — once per run for all repos (use context.selectedTracks if set)
  let tracks: string[];
  if (context.selectedTracks && context.selectedTracks.length > 0) {
    tracks = context.selectedTracks;
    console.log(chalk.cyan(`\n  Using tracks for all repos: ${tracks.join(', ')}\n`));
    logger.info(`Using run-wide tracks: ${tracks.join(', ')}`, { repo: repo.id });
  } else {
    const forAllRepos = true; // first prompt applies to all repos
    tracks = await selectVersionTracks(repo, gitClient, logger, forAllRepos);
    if (tracks.length > 0) {
      context.selectedTracks = tracks;
    }
  }
  if (tracks.length === 0) {
    result.status = 'skipped';
    logger.info('No tracks selected', { repo: repo.id });
    await restoreStash(repo, result.stashed, gitClient, logger);
    return result;
  }

  // Step 3: Process each selected track
  let abortAll = false;
  for (const track of tracks) {
    if (abortAll) break;

    const trackResult = await processTrack(repo, track, context, gitClient, logger, stateManager);
    result.tracksProcessed.push(track);

    if (trackResult.tagCreated) {
      result.tagsCreated.push(trackResult.tagCreated);
    }
    result.cherryPicks.push(...trackResult.cherryPicks);
    Object.assign(result.depsBumped, trackResult.depsBumped);
    result.errors.push(...trackResult.errors);

    // After each track, return to base branch (matches old codeUpdate.sh line 73)
    if (!context.dryRun) {
      try {
        await gitClient.checkout(repo.localPath, repo.baseBranch);
        logger.info(`Returned to ${repo.baseBranch}`, { repo: repo.id, track });
      } catch (err) {
        logger.warn(`Could not return to ${repo.baseBranch}: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
      }
    } else {
      console.log(msg.dryRunSkip(`git checkout ${repo.baseBranch}`));
    }

    if (trackResult.status === 'failed') {
      if (trackResult.errors.some((e) => e.includes('abort all'))) {
        abortAll = true;
      }
    }
  }

  await restoreStash(repo, result.stashed, gitClient, logger);

  if (result.errors.length > 0 && result.tagsCreated.length > 0) {
    result.status = 'partial';
  } else if (result.errors.length > 0) {
    result.status = 'failed';
  }

  return result;
}

async function handleDirtyTree(
  repo: RepoConfig,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger,
  stateManager: RunStateManager
): Promise<'stash' | 'proceed' | 'abort'> {
  if (stateManager.isStepCompleted(repo.id, '_', 'dirty-check')) {
    return 'proceed';
  }

  const status = await gitClient.status(repo.localPath);
  if (!status.trim()) {
    stateManager.recordStep(repo.id, '_', 'dirty-check', 'success');
    return 'proceed';
  }

  console.log(msg.dirtyTree(status));
  console.log(msg.dirtyActions());

  const { action } = await inquirer.prompt<{ action: string }>([{
    type: 'list',
    name: 'action',
    message: 'Choose action:',
    choices: [
      { name: '[S] Stash', value: 'stash' },
      { name: '[P] Proceed with warning', value: 'proceed' },
      { name: '[A] Abort this repo', value: 'abort' },
    ],
  }]);

  if (action === 'stash') {
    if (context.dryRun) {
      console.log(msg.dryRunSkip('git stash'));
    } else {
      await gitClient.stash(repo.localPath);
      logger.info('Stashed uncommitted changes', { repo: repo.id });
    }
    stateManager.recordStep(repo.id, '_', 'dirty-check', 'success', 'stashed');
    return 'stash';
  }

  if (action === 'proceed') {
    logger.warn('Proceeding with dirty working tree', { repo: repo.id });
    stateManager.recordStep(repo.id, '_', 'dirty-check', 'success', 'proceeded-dirty');
    return 'proceed';
  }

  stateManager.recordStep(repo.id, '_', 'dirty-check', 'skipped', 'aborted');
  return 'abort';
}

async function selectVersionTracks(
  repo: RepoConfig,
  gitClient: GitClient,
  logger: Logger,
  forAllRepos = false
): Promise<string[]> {
  const tags = await gitClient.tagList(repo.localPath);
  const trackMap = groupTagsByTrack(tags);
  const trackChoices: Array<{ name: string; value: string }> = [];

  for (const [track, infos] of trackMap) {
    const latest = getLatestInTrack(infos);
    if (latest) {
      let date = 'unknown';
      try {
        date = await gitClient.showTagDate(repo.localPath, latest.tag);
      } catch {
        // ignore
      }
      trackChoices.push({
        name: msg.trackInfo(track, latest.tag, date),
        value: track,
      });
    }
  }

  trackChoices.sort((a, b) => a.value.localeCompare(b.value));
  trackChoices.push({ name: msg.newTrackOption(), value: '__new__' });

  console.log(forAllRepos ? msg.trackSelectOnce() : msg.trackSelect(repo.id));
  const { selectedTracks } = await inquirer.prompt<{ selectedTracks: string[] }>([{
    type: 'checkbox',
    name: 'selectedTracks',
    message: 'Select version tracks:',
    choices: trackChoices,
  }]);

  const finalTracks: string[] = [];

  for (const t of selectedTracks) {
    if (t === '__new__') {
      const { newTrack } = await inquirer.prompt<{ newTrack: string }>([{
        type: 'input',
        name: 'newTrack',
        message: 'Enter new track (e.g. v2.9):',
        validate: (input: string) => {
          if (/^v?\d+\.\d+$/.test(input)) return true;
          return 'Track must be in format vX.Y or X.Y';
        },
      }]);
      const normalized = newTrack.startsWith('v') ? newTrack : `v${newTrack}`;
      finalTracks.push(normalized);
    } else {
      finalTracks.push(t);
    }
  }

  logger.info(`Selected tracks: ${finalTracks.join(', ')}`, { repo: repo.id });
  return finalTracks;
}

async function processTrack(
  repo: RepoConfig,
  track: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger,
  stateManager: RunStateManager
): Promise<TrackResult> {
  const result: TrackResult = {
    track,
    tagCreated: null,
    cherryPicks: [],
    depsBumped: {},
    errors: [],
    status: 'success',
  };

  console.log(chalk.cyan(`\n  ── Track: ${track} ──\n`));
  logger.info(`Processing track ${track}`, { repo: repo.id, track });

  // 3a: Compute new tag
  const tags = await gitClient.tagList(repo.localPath);
  const trackMap = groupTagsByTrack(tags);
  const trackInfos = trackMap.get(track) ?? [];
  const prevTag = getLatestInTrack(trackInfos)?.tag ?? null;

  if (!prevTag && trackInfos.length === 0) {
    console.log(chalk.yellow(`  No existing patch versions found for ${track}. Starting from .0`));
    logger.info(`No existing tags for track ${track}`, { repo: repo.id, track });
  }

  let newTag = computeNextTag(track, trackInfos);
  const tagResolution = await resolveTagConflicts(
    repo, track, newTag, trackInfos, gitClient, context, logger
  );

  if (tagResolution === null) {
    result.status = 'skipped';
    logger.info(`Track ${track} skipped`, { repo: repo.id, track });
    stateManager.recordStep(repo.id, track, 'compute-tag', 'skipped');
    return result;
  }
  newTag = tagResolution;
  stateManager.recordStep(repo.id, track, 'compute-tag', 'success', newTag);

  console.log(msg.computedTag(track, newTag));

  // Checkout to the latest patch version for this track (matches old codeUpdate.sh line 33)
  // This is the core of the old workflow — we detach HEAD to the tag
  if (prevTag) {
    if (!context.dryRun) {
      await gitClient.checkout(repo.localPath, prevTag);
      logger.info(`Checked out ${prevTag}`, { repo: repo.id, track });
      console.log(chalk.dim(`  Checked out ${prevTag}`));
    } else {
      console.log(msg.dryRunSkip(`git checkout ${prevTag}`));
    }
  }

  // BUG REPRODUCTION (upgradeArticle.sh line 36-38): For ui-article, the old script
  // creates the tag BEFORE cherry-picking. This is a bug — the tag points at the
  // pre-cherry-pick commit. We reproduce it faithfully for ui-article.
  if (repo.id === 'ui-article') {
    if (!context.dryRun) {
      try {
        await gitClient.tagCreate(repo.localPath, newTag);
        logger.info(`[article-bug] Tag ${newTag} created BEFORE cherry-pick`, { repo: repo.id, track });
        console.log(chalk.yellow(`  [article] Created tag ${newTag} (before cherry-pick — legacy behavior)`));
      } catch (err) {
        logger.warn(`Tag creation before cherry-pick failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
      }
    } else {
      console.log(msg.dryRunSkip(`git tag ${newTag} (before cherry-pick — article legacy behavior)`));
    }
  }

  // 3b: Cherry-pick first — so package.json dep-bump never conflicts.
  // Dep-bump is always a controlled edit; cherry-pick may touch package.json too.
  if (!stateManager.isStepCompleted(repo.id, track, 'cherry-pick')) {
    const cpResult = await performCherryPicks(
      repo.localPath, repo.id, track, gitClient, context, logger
    );
    result.cherryPicks = cpResult.shas;
    if (!cpResult.success) {
      result.errors.push(cpResult.error ?? 'Cherry-pick failed');
      result.status = 'failed';
      stateManager.recordStep(repo.id, track, 'cherry-pick', 'failed', cpResult.error);
      return result;
    }
    stateManager.recordStep(repo.id, track, 'cherry-pick', 'success');
  }

  // 3c: Bump parent dependency — done after cherry-pick so it never conflicts.
  if (!stateManager.isStepCompleted(repo.id, track, 'dep-bump')) {
    const bumped = await bumpParentDependency(repo, track, context, gitClient, logger);
    result.depsBumped = bumped;
    stateManager.recordStep(repo.id, track, 'dep-bump', 'success');
  }

  // 3e: npm install (optional — engineer can skip)
  if (!stateManager.isStepCompleted(repo.id, track, 'npm-install')) {
    const installResult = await runInstall(repo.localPath, repo.id, track, context, logger);
    if (installResult.skipped) {
      stateManager.recordStep(repo.id, track, 'npm-install', 'skipped');
    } else if (installResult.aborted) {
      result.errors.push('npm install aborted');
      stateManager.recordStep(repo.id, track, 'npm-install', 'failed');
    } else {
      stateManager.recordStep(repo.id, track, 'npm-install', 'success');
    }
  }

  // 3f: npm run build (optional — engineer can skip)
  if (!stateManager.isStepCompleted(repo.id, track, 'npm-build')) {
    const buildResult = await runBuild(repo.localPath, repo.id, track, context, logger);
    if (buildResult.skipped) {
      stateManager.recordStep(repo.id, track, 'npm-build', 'skipped');
    } else if (buildResult.aborted) {
      result.errors.push('npm build aborted');
      stateManager.recordStep(repo.id, track, 'npm-build', 'failed');
    } else {
      stateManager.recordStep(repo.id, track, 'npm-build', 'success');
    }
  }

  // 3g: Pre-push diff summary
  const displayPrevTag = prevTag ?? `${track}.0`;
  const diffAction = await showDiffSummary(repo, displayPrevTag, newTag, gitClient, context, logger);
  stateManager.recordStep(repo.id, track, 'diff-summary', 'success');

  if (diffAction === 'skip') {
    result.status = 'skipped';
    logger.info('Repo skipped at diff summary', { repo: repo.id, track });
    return result;
  }

  if (diffAction === 'abort') {
    result.status = 'failed';
    result.errors.push('abort all requested at diff summary');
    return result;
  }

  // 3h: Push — for non-article repos the tag is created here (normal flow).
  // For ui-article the tag was already created above (bug reproduction).
  if (!stateManager.isStepCompleted(repo.id, track, 'push')) {
    const branch = await gitClient.currentBranch(repo.localPath);
    const pushResult = await pushChanges(
      repo.localPath, repo.id, track, branch, newTag, gitClient, context, logger,
      repo.id === 'ui-article' // tagAlreadyCreated — skip re-tagging for article
    );

    if (pushResult.success || pushResult.manual) {
      result.tagCreated = newTag;
      context.tagsCreated.set(repo.id, [
        ...(context.tagsCreated.get(repo.id) ?? []),
        newTag,
      ]);
      stateManager.recordTagCreated(repo.id, newTag);

      // Old scripts delete local tag after push (codeUpdate.sh lines 68-69)
      if (!context.dryRun && !pushResult.manual) {
        try {
          await gitClient.tagDelete(repo.localPath, newTag);
          logger.info(`Deleted local tag ${newTag} after push (legacy behavior)`, { repo: repo.id, track });
          console.log(chalk.dim(`  Deleted local tag: ${newTag}`));
        } catch (err) {
          logger.warn(`Failed to delete local tag ${newTag}: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
        }
      } else if (context.dryRun) {
        console.log(msg.dryRunSkip(`git tag -d ${newTag} (post-push cleanup)`));
      }

      stateManager.recordStep(repo.id, track, 'push', 'success', pushResult.manual ? 'manual' : undefined);
      logger.info(`Tag ${newTag} created and ${pushResult.manual ? 'marked manual' : 'pushed'}`, { repo: repo.id, track });
    } else {
      result.errors.push('Push failed');
      result.status = 'partial';
      stateManager.recordStep(repo.id, track, 'push', 'failed');
    }
  }

  return result;
}

async function resolveTagConflicts(
  repo: RepoConfig,
  track: string,
  computedTag: string,
  trackInfos: TagInfo[],
  gitClient: GitClient,
  context: RunContext,
  logger: Logger
): Promise<string | null> {
  const parsed = parseTag(computedTag);
  if (parsed && parsed.patch > 999) {
    console.log(msg.patchWarning(parsed.patch));
    const { patchAction } = await inquirer.prompt<{ patchAction: string }>([{
      type: 'list',
      name: 'patchAction',
      message: 'Choose action:',
      choices: [
        { name: '[C] Confirm', value: 'confirm' },
        { name: '[E] Enter custom version', value: 'custom' },
      ],
    }]);

    if (patchAction === 'custom') {
      return promptCustomVersion(track);
    }
  }

  const allTags = await gitClient.tagList(repo.localPath);
  const existsLocally = allTags.includes(computedTag);
  let existsRemote = false;
  try {
    existsRemote = await gitClient.tagExistsRemote(repo.localPath, computedTag);
  } catch {
    // remote check may fail
  }

  if (existsLocally || existsRemote) {
    const location = existsLocally && existsRemote ? 'locally and remotely'
      : existsLocally ? 'locally' : 'remotely';
    console.log(msg.tagExists(computedTag, location));

    const { tagAction } = await inquirer.prompt<{ tagAction: string }>([{
      type: 'list',
      name: 'tagAction',
      message: 'Choose action:',
      choices: [
        { name: '[D] Delete and recreate', value: 'delete' },
        { name: '[C] Enter custom version', value: 'custom' },
        { name: '[S] Skip this track', value: 'skip' },
      ],
    }]);

    if (tagAction === 'skip') return null;

    if (tagAction === 'custom') {
      return promptCustomVersion(track);
    }

    if (tagAction === 'delete') {
      if (context.dryRun) {
        console.log(msg.dryRunSkip(`git tag -d ${computedTag}`));
        if (existsRemote) {
          console.log(msg.dryRunSkip(`git push origin --delete ${computedTag}`));
        }
      } else {
        if (existsLocally) {
          await gitClient.tagDelete(repo.localPath, computedTag);
          logger.info(`Deleted local tag ${computedTag}`, { repo: repo.id, track });
        }
        if (existsRemote) {
          await gitClient.tagDeleteRemote(repo.localPath, computedTag);
          logger.info(`Deleted remote tag ${computedTag}`, { repo: repo.id, track });
        }
      }
    }
  }

  return computedTag;
}

async function promptCustomVersion(track: string): Promise<string> {
  const { customTag } = await inquirer.prompt<{ customTag: string }>([{
    type: 'input',
    name: 'customTag',
    message: `Enter custom tag for track ${track} (e.g. ${track}.500):`,
    validate: (input: string) => {
      if (/^v?\d+\.\d+\.\d+$/.test(input)) return true;
      return 'Tag must be in format vX.Y.Z or X.Y.Z';
    },
  }]);
  return customTag.startsWith('v') ? customTag : `v${customTag}`;
}

async function restoreStash(
  repo: RepoConfig,
  wasStashed: boolean,
  gitClient: GitClient,
  logger: Logger
): Promise<void> {
  if (!wasStashed) return;

  try {
    await gitClient.stashPop(repo.localPath);
    logger.info('Restored stashed changes', { repo: repo.id });
  } catch (err) {
    const stashList = await gitClient.stashList(repo.localPath);
    console.log(msg.stashPopFailed(stashList));
    logger.warn('Stash pop failed', { repo: repo.id });
  }
}
