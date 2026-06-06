"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpParentDependency = bumpParentDependency;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const config_1 = require("./config");
const messages_1 = require("./messages");
const version_1 = require("./version");
const dep_utils_1 = require("./dep-utils");
async function bumpParentDependency(repo, track, context, gitClient, logger) {
    const bumped = {};
    for (const depId of repo.deps) {
        const pkgKey = repo.packageJsonDepKeys[depId];
        if (!pkgKey)
            continue;
        const parentRepo = (0, config_1.getRepoById)(depId);
        let newTag = null;
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
                const remoteTags = await gitClient.lsRemoteTagsFiltered(repo.localPath, parentRepo.gitRemoteUrl, track);
                if (remoteTags.length > 0) {
                    newTag = remoteTags[remoteTags.length - 1];
                    logger.info(`Using latest remote tag ${newTag} for parent ${depId} (Scenario C)`, { repo: repo.id, track });
                }
            }
            catch (err) {
                logger.warn(`ls-remote failed for ${depId}: ${err instanceof Error ? err.message : String(err)}`, { repo: repo.id, track });
            }
        }
        if (!newTag) {
            logger.info(`No tag available for parent ${depId} on track ${track}`, { repo: repo.id, track });
            continue;
        }
        await doBump(repo, depId, pkgKey, newTag, parentRepo?.gitRemoteUrl ?? '', track, context, gitClient, logger, bumped);
    }
    // ui-article: only bump if user chose to upgrade and provided version(s)
    if (repo.consumesArticle) {
        await ensureArticleUpgradeChoice(context, logger);
        await bumpArticleDependency(repo, track, context, gitClient, logger, bumped);
    }
    return bumped;
}
/** Prompt once for ui-article upgrade mode and version(s); store in context. */
async function ensureArticleUpgradeChoice(context, logger) {
    if (context.articleUpgradeMode !== undefined)
        return;
    console.log(messages_1.msg.articleUpgradePrompt());
    const { mode } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'mode',
            message: 'Choose:',
            choices: [
                { name: 'No — leave ui-article as-is', value: 'none' },
                { name: 'Yes — single version for all tracks', value: 'single' },
                { name: 'Per-track mapping', value: 'per-track' },
            ],
        }]);
    context.articleUpgradeMode = mode;
    logger.info(`ui-article upgrade mode: ${mode}`, {});
    if (mode === 'single') {
        const { version } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'version',
                message: messages_1.msg.articleVersionSingle(),
                validate: (v) => (v.trim() ? true : 'Enter a version/tag (e.g. v6.6.6)'),
            }]);
        context.articleVersion = version.trim().startsWith('v') ? version.trim() : `v${version.trim()}`;
        logger.info(`ui-article single version: ${context.articleVersion}`, {});
    }
    else if (mode === 'per-track') {
        const tracks = context.selectedTracks ?? [];
        context.articleVersionByTrack = {};
        for (const track of tracks) {
            const { version } = await inquirer_1.default.prompt([{
                    type: 'input',
                    name: 'version',
                    message: messages_1.msg.articleVersionForTrack(track),
                }]);
            const v = version.trim();
            if (v) {
                context.articleVersionByTrack[track] = v.startsWith('v') ? v : `v${v}`;
            }
        }
        logger.info(`ui-article per-track: ${JSON.stringify(context.articleVersionByTrack)}`, {});
    }
}
async function bumpArticleDependency(repo, track, context, gitClient, logger, bumped) {
    if (context.articleUpgradeMode === 'none' || context.articleUpgradeMode === undefined) {
        return;
    }
    let targetTag = null;
    if (context.articleUpgradeMode === 'single' && context.articleVersion) {
        targetTag = context.articleVersion;
    }
    else if (context.articleUpgradeMode === 'per-track' && context.articleVersionByTrack?.[track]) {
        targetTag = context.articleVersionByTrack[track];
    }
    if (!targetTag) {
        logger.info(`No ui-article version selected for track ${track}, skipping`, { repo: repo.id, track });
        return;
    }
    const pkgJsonPath = path_1.default.join(repo.localPath, 'package.json');
    if (!fs_1.default.existsSync(pkgJsonPath))
        return;
    const rawPkg = fs_1.default.readFileSync(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(rawPkg);
    let currentValue = null;
    let sectionKey = null;
    const articleKey = 'ui-article';
    for (const section of dep_utils_1.DEP_SECTIONS) {
        const deps = pkgJson[section];
        if (deps && articleKey in deps) {
            currentValue = deps[articleKey];
            sectionKey = section;
            break;
        }
    }
    if (!currentValue || !sectionKey) {
        return;
    }
    const newVersion = targetTag.replace(/^v/, '');
    const currentVersion = (0, dep_utils_1.extractVersionFromGitSsh)(currentValue);
    if (currentVersion === newVersion) {
        console.log(chalk_1.default.dim(`  ui-article is already at ${targetTag}, skipping update.`));
        logger.info(`ui-article already at ${targetTag}`, { repo: repo.id, track });
        return;
    }
    const newDepValue = (0, dep_utils_1.isGitSshFormat)(currentValue)
        ? (0, dep_utils_1.buildGitSshDepValue)('git@github.com:atypon/ui-article.git', targetTag)
        : newVersion;
    if (context.dryRun) {
        console.log(messages_1.msg.dryRunSkip(`Update ui-article to ${targetTag} in ${pkgJsonPath}`));
        bumped['ui-article'] = newVersion;
        return;
    }
    console.log(messages_1.msg.depBump('ui-article', articleKey, currentValue, newDepValue));
    const newContent = (0, dep_utils_1.replaceDepValueInRawPackageJson)(rawPkg, articleKey, currentValue, newDepValue);
    fs_1.default.writeFileSync(pkgJsonPath, newContent, 'utf-8');
    await gitClient.add(repo.localPath, ['package.json']);
    await gitClient.commitAll(repo.localPath, `Upgrade ui-article to ${targetTag}`);
    logger.info(`Bumped ui-article to ${targetTag}`, { repo: repo.id, track });
    bumped['ui-article'] = newVersion;
}
async function doBump(repo, depId, pkgKey, newTag, parentRemoteUrl, track, context, gitClient, logger, bumped) {
    const pkgJsonPath = path_1.default.join(repo.localPath, 'package.json');
    if (!fs_1.default.existsSync(pkgJsonPath)) {
        logger.error(`package.json not found at ${pkgJsonPath}`, { repo: repo.id, track });
        return;
    }
    const rawPkg = fs_1.default.readFileSync(pkgJsonPath, 'utf-8');
    const pkgJson = JSON.parse(rawPkg);
    let found = false;
    let currentValue = null;
    let sectionKey = null;
    let actualKey = pkgKey;
    // Old scripts auto-detect from package.json (UpdateTheme2.sh line 14-18):
    // parent_dependency=$(jq -r 'if .dependencies["ui-core"] then "ui-core" elif .dependencies["ui-base"] then "ui-base"')
    for (const section of dep_utils_1.DEP_SECTIONS) {
        const deps = pkgJson[section];
        if (deps && pkgKey in deps) {
            currentValue = deps[pkgKey];
            sectionKey = section;
            found = true;
            break;
        }
    }
    if (!found) {
        // Try the raw depId name as fallback (old scripts use raw names like "ui-core")
        for (const section of dep_utils_1.DEP_SECTIONS) {
            const deps = pkgJson[section];
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
        const allKeys = [];
        for (const section of dep_utils_1.DEP_SECTIONS) {
            const deps = pkgJson[section];
            if (deps)
                allKeys.push(...Object.keys(deps));
        }
        console.log(messages_1.msg.depKeyMissing(depId, pkgKey, allKeys));
        logger.warn(`Dep key ${pkgKey} not found in package.json`, { repo: repo.id, track });
        const { confirmKey } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'confirmKey',
                message: `Enter the correct dependency key for ${depId} (or press Enter to skip):`,
            }]);
        if (!confirmKey)
            return;
        actualKey = confirmKey;
        for (const section of dep_utils_1.DEP_SECTIONS) {
            const deps = pkgJson[section];
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
    const newVersion = (0, version_1.tagToVersion)(newTag);
    let newDepValue;
    if (currentValue && (0, dep_utils_1.isGitSshFormat)(currentValue)) {
        newDepValue = (0, dep_utils_1.buildGitSshDepValue)(parentRemoteUrl, newTag);
    }
    else {
        newDepValue = newVersion;
    }
    if (currentValue) {
        const currentVer = (0, dep_utils_1.extractVersionFromGitSsh)(currentValue);
        if ((0, version_1.isVersionAhead)(currentVer, newVersion)) {
            console.log(messages_1.msg.depVersionDrift(actualKey, currentValue, newDepValue));
            const { confirmOverwrite } = await inquirer_1.default.prompt([{
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
        console.log(messages_1.msg.dryRunSkip(`Update ${actualKey} to ${newDepValue} in ${pkgJsonPath}`));
        bumped[depId] = newVersion;
        return;
    }
    console.log(messages_1.msg.depBump(depId, actualKey, currentValue ?? 'none', newDepValue));
    const oldValue = currentValue ?? '';
    const newContent = (0, dep_utils_1.replaceDepValueInRawPackageJson)(rawPkg, actualKey, oldValue, newDepValue);
    fs_1.default.writeFileSync(pkgJsonPath, newContent, 'utf-8');
    const filesToStage = ['package.json'];
    const lockFiles = ['package-lock.json', 'yarn.lock'];
    for (const lf of lockFiles) {
        if (fs_1.default.existsSync(path_1.default.join(repo.localPath, lf))) {
            filesToStage.push(lf);
        }
    }
    await gitClient.add(repo.localPath, filesToStage);
    // Commit message matches old scripts: "Update ${dependency} to version $latest_dependency_tag"
    await gitClient.commitAll(repo.localPath, `Update ${actualKey} to version ${newTag}`);
    logger.info(`Bumped ${actualKey} to ${newDepValue}`, { repo: repo.id, track });
    bumped[depId] = newVersion;
}
//# sourceMappingURL=dep-bump.js.map