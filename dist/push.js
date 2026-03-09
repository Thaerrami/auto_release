"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushChanges = pushChanges;
const inquirer_1 = __importDefault(require("inquirer"));
const messages_1 = require("./messages");
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function pushChanges(repoPath, repoId, track, branch, newTag, gitClient, context, logger, tagAlreadyCreated = false) {
    if (context.dryRun) {
        if (!tagAlreadyCreated) {
            console.log(messages_1.msg.dryRunSkip(`git tag ${newTag}`));
        }
        console.log(messages_1.msg.dryRunSkip(`git push origin ${newTag}`));
        logger.info(`[DRY-RUN] Would push tag ${newTag}`, { repo: repoId, track });
        return { success: true, manual: false };
    }
    if (!tagAlreadyCreated) {
        await gitClient.tagCreate(repoPath, newTag);
        logger.info(`Tag ${newTag} created locally`, { repo: repoId, track });
    }
    const branchResult = await pushWithRetry(() => gitClient.push(repoPath, branch), repoPath, repoId, track, branch, 'branch', gitClient, logger);
    if (!branchResult.success) {
        if (branchResult.manual) {
            logger.warn(`Push of ${branch} marked as manual (protected branch)`, { repo: repoId, track });
        }
        else {
            logger.error(`Push of ${branch} failed`, { repo: repoId, track });
            return branchResult;
        }
    }
    const tagResult = await pushWithRetry(() => gitClient.pushTag(repoPath, newTag), repoPath, repoId, track, newTag, 'tag', gitClient, logger);
    if (!tagResult.success) {
        if (tagResult.manual) {
            logger.warn(`Push of tag ${newTag} marked as manual`, { repo: repoId, track });
        }
        else {
            logger.error(`Push of tag ${newTag} failed`, { repo: repoId, track });
        }
    }
    return {
        success: branchResult.success || branchResult.manual,
        manual: branchResult.manual || tagResult.manual,
    };
}
async function pushWithRetry(pushFn, repoPath, repoId, track, ref, refType, gitClient, logger) {
    let result = await pushFn();
    if (result.success) {
        logger.info(`Pushed ${refType} ${ref}`, { repo: repoId, track });
        return { success: true, manual: false };
    }
    console.log(messages_1.msg.pushRejected(result.errorType ?? 'unknown'));
    switch (result.errorType) {
        case 'non-fast-forward': {
            const { doRebase } = await inquirer_1.default.prompt([{
                    type: 'confirm',
                    name: 'doRebase',
                    message: 'Run git pull --rebase and retry?',
                    default: true,
                }]);
            if (doRebase && refType === 'branch') {
                try {
                    await gitClient.pullRebase(repoPath, ref);
                    logger.info(`Rebased ${ref}`, { repo: repoId, track });
                    result = await pushFn();
                    if (result.success) {
                        logger.info(`Pushed ${refType} ${ref} after rebase`, { repo: repoId, track });
                        return { success: true, manual: false };
                    }
                }
                catch (err) {
                    logger.error(`Rebase failed: ${err instanceof Error ? err.message : String(err)}`, { repo: repoId, track });
                }
            }
            return { success: false, manual: false };
        }
        case 'auth':
            console.log('  Check your GitHub token / SSH key configuration.');
            console.log('  For HTTPS: ensure GH_TOKEN or GITHUB_TOKEN is set.');
            console.log('  For SSH: ensure ssh-agent has your key loaded.');
            logger.error('Auth error pushing', { repo: repoId, track });
            await inquirer_1.default.prompt([{ type: 'input', name: 'pause', message: 'Press ENTER to continue after fixing auth...' }]);
            result = await pushFn();
            return { success: result.success, manual: false };
        case 'protected-branch':
            logger.warn(`Protected branch — marking as manual`, { repo: repoId, track });
            return { success: false, manual: true };
        case 'timeout': {
            const backoffs = [2000, 4000, 8000];
            for (const delay of backoffs) {
                console.log(`  Retrying in ${delay / 1000}s...`);
                await sleep(delay);
                result = await pushFn();
                if (result.success) {
                    logger.info(`Pushed ${refType} ${ref} after timeout retry`, { repo: repoId, track });
                    return { success: true, manual: false };
                }
            }
            console.log('  All retries exhausted.');
            logger.error('Push timed out after all retries', { repo: repoId, track });
            await inquirer_1.default.prompt([{ type: 'input', name: 'pause', message: 'Press ENTER after fixing network...' }]);
            result = await pushFn();
            return { success: result.success, manual: false };
        }
        default:
            logger.error(`Push failed: ${result.error}`, { repo: repoId, track });
            return { success: false, manual: false };
    }
}
//# sourceMappingURL=push.js.map