import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { RepoConfig, RunContext, GitClient } from './types';
import { ARTICLE_REMOTE_URL, getRepoById } from './config';
import { msg } from './messages';
import { tagToVersion, isVersionAhead } from './version';
import { Logger } from './logger';

function extractVersionFromGitSsh(value: string): string {
  const hashIdx = value.lastIndexOf('#');
  if (hashIdx !== -1) {
    return value.slice(hashIdx + 1).replace(/^v/, '');
  }
  return value.replace(/^[~^]/, '').replace(/^v/, '');
}

function buildGitSshDepValue(remoteUrl: string, tag: string): string {
  return `git+ssh://${remoteUrl}#${tag}`;
}

function isGitSshFormat(value: string): boolean {
  return value.startsWith('git+ssh://') || value.startsWith('git://');
}

export async function bumpParentDependency(
  repo: RepoConfig,
  track: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger
): Promise<Record<string, string>> {
  const bumped: Record<string, string> = {};

  for (const depId of repo.deps) {
    const pkgKey = repo.packageJsonDepKeys[depId];
    if (!pkgKey) continue;

    const parentRepo = getRepoById(depId);
    let newTag: string | null = null;

    // Check if parent was released in this run
    const parentTags = context.tagsCreated.get(depId);
    if (parentTags && parentTags.length > 0) {
      const matchingTag = parentTags.find((t) => t.startsWith(track + '.'));
      if (matchingTag) {
        newTag = matchingTag;
      }
    }

    // Scenario C: parent NOT released this run — look up latest remote tag
    // (matches old UpgradeTheme2.sh / UpdateTheme2.sh which does ls-remote
    // to find the latest tag on the parent for this track)
    if (!newTag && parentRepo) {
      try {
        const remoteTags = await gitClient.lsRemoteTagsFiltered(
          repo.localPath, parentRepo.gitRemoteUrl, track
        );
        if (remoteTags.length > 0) {
          newTag = remoteTags[remoteTags.length - 1];
          logger.info(`Using latest remote tag ${newTag} for parent ${depId} (Scenario C)`, { repo: repo.id, track });
        }
      } catch (err) {
        logger.warn(`ls-remote failed for ${depId}: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
      }
    }

    if (!newTag) {
      logger.info(`No tag available for parent ${depId} on track ${track}`, { repo: repo.id, track });
      continue;
    }

    await doBump(repo, depId, pkgKey, newTag, parentRepo?.gitRemoteUrl ?? '', track, context, gitClient, logger, bumped);
  }

  // Handle ui-article consumption (matches upgradeArticle.sh consumeThemes
  // and UpdateTheme2.sh which bumps ui-article in theme/core repos)
  if (repo.consumesArticle) {
    await bumpArticleDependency(repo, track, context, gitClient, logger, bumped);
  }

  return bumped;
}

async function bumpArticleDependency(
  repo: RepoConfig,
  track: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger,
  bumped: Record<string, string>
): Promise<void> {
  const pkgJsonPath = path.join(repo.localPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;
  const depSections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

  let currentValue: string | null = null;
  let sectionKey: string | null = null;
  const articleKey = 'ui-article';

  for (const section of depSections) {
    const deps = pkgJson[section] as Record<string, string> | undefined;
    if (deps && articleKey in deps) {
      currentValue = deps[articleKey];
      sectionKey = section;
      break;
    }
  }

  if (!currentValue || !sectionKey) {
    return;
  }

  // Look up latest remote ui-article tag (matches upgradeArticle.sh line 100)
  let latestArticleTag: string | null = null;

  // First check if ui-article was released in this run
  const articleTags = context.tagsCreated.get('ui-article');
  if (articleTags && articleTags.length > 0) {
    latestArticleTag = articleTags[articleTags.length - 1];
  } else {
    try {
      const remoteTags = await gitClient.lsRemoteTags(repo.localPath, ARTICLE_REMOTE_URL);
      if (remoteTags.length > 0) {
        latestArticleTag = remoteTags[remoteTags.length - 1];
      }
    } catch (err) {
      logger.warn(`ls-remote for ui-article failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
    }
  }

  if (!latestArticleTag) return;

  const currentVersion = extractVersionFromGitSsh(currentValue);
  const newVersion = latestArticleTag.replace(/^v/, '');

  if (currentVersion === newVersion) {
    console.log(chalk.dim(`  ui-article is already at ${latestArticleTag}, skipping update.`));
    logger.info(`ui-article already at ${latestArticleTag}`, { repo: repo.id, track });
    return;
  }

  const newDepValue = isGitSshFormat(currentValue)
    ? buildGitSshDepValue('git@github.com:atypon/ui-article.git', latestArticleTag)
    : latestArticleTag.replace(/^v/, '');

  if (context.dryRun) {
    console.log(msg.dryRunSkip(`Update ui-article to ${latestArticleTag} in ${pkgJsonPath}`));
    bumped['ui-article'] = newVersion;
    return;
  }

  console.log(msg.depBump('ui-article', articleKey, currentValue, newDepValue));

  const deps = pkgJson[sectionKey] as Record<string, string>;
  deps[articleKey] = newDepValue;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

  await gitClient.add(repo.localPath, ['package.json']);
  await gitClient.commitAll(repo.localPath, `Upgrade ui-article to ${latestArticleTag}`);
  logger.info(`Bumped ui-article to ${latestArticleTag}`, { repo: repo.id, track });
  bumped['ui-article'] = newVersion;
}

async function doBump(
  repo: RepoConfig,
  depId: string,
  pkgKey: string,
  newTag: string,
  parentRemoteUrl: string,
  track: string,
  context: RunContext,
  gitClient: GitClient,
  logger: Logger,
  bumped: Record<string, string>
): Promise<void> {
  const pkgJsonPath = path.join(repo.localPath, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    logger.error(`package.json not found at ${pkgJsonPath}`, { repo: repo.id, track });
    return;
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as Record<string, unknown>;

  const depSections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
  let found = false;
  let currentValue: string | null = null;
  let sectionKey: string | null = null;
  let actualKey = pkgKey;

  // Old scripts auto-detect from package.json (UpdateTheme2.sh line 14-18):
  // parent_dependency=$(jq -r 'if .dependencies["ui-core"] then "ui-core" elif .dependencies["ui-base"] then "ui-base"')
  for (const section of depSections) {
    const deps = pkgJson[section] as Record<string, string> | undefined;
    if (deps && pkgKey in deps) {
      currentValue = deps[pkgKey];
      sectionKey = section;
      found = true;
      break;
    }
  }

  if (!found) {
    // Try the raw depId name as fallback (old scripts use raw names like "ui-core")
    for (const section of depSections) {
      const deps = pkgJson[section] as Record<string, string> | undefined;
      if (deps && depId in deps) {
        currentValue = deps[depId];
        sectionKey = section;
        actualKey = depId;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    const allKeys: string[] = [];
    for (const section of depSections) {
      const deps = pkgJson[section] as Record<string, string> | undefined;
      if (deps) allKeys.push(...Object.keys(deps));
    }
    console.log(msg.depKeyMissing(depId, pkgKey, allKeys));
    logger.warn(`Dep key ${pkgKey} not found in package.json`, { repo: repo.id, track });

    const { confirmKey } = await inquirer.prompt<{ confirmKey: string }>([{
      type: 'input',
      name: 'confirmKey',
      message: `Enter the correct dependency key for ${depId} (or press Enter to skip):`,
    }]);

    if (!confirmKey) return;
    actualKey = confirmKey;

    for (const section of depSections) {
      const deps = pkgJson[section] as Record<string, string> | undefined;
      if (deps && confirmKey in deps) {
        currentValue = deps[confirmKey];
        sectionKey = section;
        found = true;
        break;
      }
    }

    if (!found) {
      logger.error(`Key ${confirmKey} also not found in any dep section`, { repo: repo.id, track });
      return;
    }
  }

  // Build the new dep value — preserve git+ssh format if the current value uses it
  // (matches old UpgradeThemes.sh/UpdateTheme2.sh jq command which writes:
  //   git+ssh://git@github.com/atypon/${dependency}.git#${latest_dependency_tag})
  const newVersion = tagToVersion(newTag);
  let newDepValue: string;
  if (currentValue && isGitSshFormat(currentValue)) {
    newDepValue = buildGitSshDepValue(parentRemoteUrl, newTag);
  } else {
    newDepValue = newVersion;
  }

  if (currentValue) {
    const currentVer = extractVersionFromGitSsh(currentValue);
    if (isVersionAhead(currentVer, newVersion)) {
      console.log(msg.depVersionDrift(actualKey, currentValue, newDepValue));
      const { confirmOverwrite } = await inquirer.prompt<{ confirmOverwrite: boolean }>([{
        type: 'confirm',
        name: 'confirmOverwrite',
        message: 'Overwrite with the new version?',
        default: false,
      }]);
      if (!confirmOverwrite) {
        logger.warn(`Skipped dep bump for ${actualKey} due to version drift`, { repo: repo.id, track });
        return;
      }
    }
  }

  if (context.dryRun) {
    console.log(msg.dryRunSkip(`Update ${actualKey} to ${newDepValue} in ${pkgJsonPath}`));
    bumped[depId] = newVersion;
    return;
  }

  console.log(msg.depBump(depId, actualKey, currentValue ?? 'none', newDepValue));

  const deps = pkgJson[sectionKey!] as Record<string, string>;
  deps[actualKey] = newDepValue;
  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');

  const filesToStage = ['package.json'];
  const lockFiles = ['package-lock.json', 'yarn.lock'];
  for (const lf of lockFiles) {
    if (fs.existsSync(path.join(repo.localPath, lf))) {
      filesToStage.push(lf);
    }
  }

  await gitClient.add(repo.localPath, filesToStage);
  // Commit message matches old scripts: "Update ${dependency} to version $latest_dependency_tag"
  await gitClient.commitAll(repo.localPath, `Update ${actualKey} to version ${newTag}`);
  logger.info(`Bumped ${actualKey} to ${newDepValue}`, { repo: repo.id, track });
  bumped[depId] = newVersion;
}
