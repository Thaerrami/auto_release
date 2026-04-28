"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseShaInput = parseShaInput;
exports.performCherryPicks = performCherryPicks;
const inquirer_1 = __importDefault(require("inquirer"));
const readline_1 = __importDefault(require("readline"));
const chalk_1 = __importDefault(require("chalk"));
const messages_1 = require("./messages");
function parseShaInput(input) {
    if (!input.trim())
        return [];
    const parts = input.trim().split(/\s+/);
    const shas = [];
    for (const part of parts) {
        shas.push(part);
    }
    return shas;
}
async function waitForUserAction() {
    return new Promise((resolve) => {
        const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('  > ', (answer) => {
            rl.close();
            const normalized = answer.trim().toUpperCase();
            if (normalized === 'ABORT') {
                resolve('abort');
            }
            else if (normalized === 'SKIP') {
                resolve('skip');
            }
            else {
                resolve('continue');
            }
        });
    });
}
async function performCherryPicks(repoPath, repoId, track, gitClient, context, logger) {
    // Use run-wide SHAs if already set (prompt once, use for all repos/tracks)
    let shas;
    if (Array.isArray(context.cherryPickShas)) {
        shas = context.cherryPickShas;
        if (shas.length > 0) {
            console.log(chalk_1.default.dim(`  Using cherry-pick SHAs for all: ${shas.join(' ')}`));
            logger.info(`Using run-wide cherry-pick SHAs`, { repo: repoId, track });
        }
    }
    else {
        const { shaInput } = await inquirer_1.default.prompt([{
                type: 'input',
                name: 'shaInput',
                message: messages_1.msg.cherryPickPromptAll(),
            }]);
        shas = parseShaInput(shaInput);
        context.cherryPickShas = shas;
    }
    if (shas.length === 0) {
        logger.info('No cherry-picks requested', { repo: repoId, track });
        return { shas: [], success: true };
    }
    const validShas = [];
    for (const sha of shas) {
        if (sha.includes('..')) {
            validShas.push(sha);
            continue;
        }
        const exists = await gitClient.shaExists(repoPath, sha);
        if (!exists) {
            console.log(messages_1.msg.cherryPickShaNotFound(sha));
            logger.error(`SHA ${sha} not found in repo history`, { repo: repoId, track });
        }
        else {
            validShas.push(sha);
        }
    }
    if (validShas.length === 0) {
        logger.warn('All SHAs were invalid, skipping cherry-pick', { repo: repoId, track });
        return { shas: [], success: true };
    }
    if (context.dryRun) {
        console.log(messages_1.msg.dryRunSkip(`git cherry-pick ${validShas.join(' ')}`));
        logger.info(`[DRY-RUN] Would cherry-pick: ${validShas.join(' ')}`, { repo: repoId, track });
        return { shas: validShas, success: true };
    }
    for (const sha of validShas) {
        const isMerge = await gitClient.isMergeCommit(repoPath, sha);
        if (isMerge) {
            console.log(chalk_1.default.dim(`  Cherry-picking merge commit: ${sha} (using -m 1)`));
            logger.info(`Cherry-picking merge commit ${sha} with -m 1`, { repo: repoId, track });
        }
        else {
            console.log(chalk_1.default.dim(`  Cherry-picking revision: ${sha}`));
        }
        const result = await gitClient.cherryPick(repoPath, [sha]);
        if (result.success) {
            logger.info(`Cherry-picked ${sha}`, { repo: repoId, track });
            continue;
        }
        if (result.conflicting) {
            const conflictOutput = await gitClient.conflictFiles(repoPath);
            console.log(messages_1.msg.cherryPickConflict(sha, conflictOutput));
            logger.warn(`Cherry-pick conflict on ${sha}`, { repo: repoId, track });
            while (true) {
                // Always re-print current conflict status so the engineer can see what's left.
                const currentConflicts = await gitClient.conflictFiles(repoPath);
                if (currentConflicts.trim()) {
                    console.log(chalk_1.default.dim(`  Still conflicted:\n${currentConflicts.trim()}\n`));
                }
                else {
                    const status = await gitClient.status(repoPath);
                    if (status.trim()) {
                        console.log(chalk_1.default.dim(`  Working tree status:\n${status.trim()}\n`));
                    }
                    else {
                        console.log(chalk_1.default.dim('  Working tree clean.\n'));
                    }
                }
                const action = await waitForUserAction();
                if (action === 'abort') {
                    await gitClient.cherryPickAbort(repoPath);
                    logger.warn(`Cherry-pick aborted by engineer on ${sha}`, { repo: repoId, track });
                    return { shas: validShas, success: false, error: `Conflict on ${sha} — aborted` };
                }
                if (action === 'skip') {
                    const skipResult = await gitClient.cherryPickSkip(repoPath);
                    if (skipResult.success) {
                        console.log(chalk_1.default.dim(`  Skipped ${sha}.`));
                        logger.info(`Cherry-pick skipped for ${sha}`, { repo: repoId, track });
                        break;
                    }
                    // If git reports there's nothing to skip, we likely already continued/aborted manually.
                    if ((skipResult.error ?? '').includes('no cherry-pick or revert in progress')) {
                        const alreadyCommitted = await gitClient.logContains(repoPath, sha);
                        if (alreadyCommitted) {
                            console.log(chalk_1.default.dim(`  Revision ${sha} already committed. Continuing...`));
                            logger.info(`Revision ${sha} already in history after skip attempt`, { repo: repoId, track });
                            break;
                        }
                    }
                    console.log(chalk_1.default.dim(`  Unable to skip ${sha}.`));
                    logger.warn(`Unable to skip ${sha}: ${skipResult.error}`, { repo: repoId, track });
                    continue;
                }
                const continueResult = await gitClient.cherryPickContinue(repoPath);
                if (continueResult.success) {
                    console.log(chalk_1.default.green('  Cherry-pick completed successfully.'));
                    logger.info(`Cherry-pick conflict resolved for ${sha}`, { repo: repoId, track });
                    break;
                }
                const errMsg = continueResult.error ?? '';
                if (errMsg.includes('nothing to commit') ||
                    errMsg.includes('no changes') ||
                    errMsg.includes('previous cherry-pick is now empty')) {
                    console.log(chalk_1.default.dim(`  Cherry-pick is empty after resolution. Skipping ${sha}...`));
                    logger.warn(`Cherry-pick empty after resolution for ${sha}`, { repo: repoId, track, output: errMsg });
                    await gitClient.cherryPickSkip(repoPath);
                    break;
                }
                // Common case: user resolved and maybe completed it manually; simple-git now says "no cherry-pick..."
                if (errMsg.includes('no cherry-pick or revert in progress')) {
                    const alreadyCommitted = await gitClient.logContains(repoPath, sha);
                    if (alreadyCommitted) {
                        console.log(chalk_1.default.dim(`  Revision ${sha} already committed. Continuing...`));
                        logger.info(`Revision ${sha} already in history after continue reported no in-progress`, { repo: repoId, track });
                        break;
                    }
                    console.log(chalk_1.default.dim('  No cherry-pick in progress, but revision not found in history. Aborting this commit.'));
                    logger.warn(`No cherry-pick in progress after conflict on ${sha}, not in history`, { repo: repoId, track, output: errMsg });
                    await gitClient.cherryPickAbort(repoPath);
                    break;
                }
                if (continueResult.conflicting) {
                    // Still conflicting — keep waiting for engineer to resolve/add.
                    const newConflictOutput = await gitClient.conflictFiles(repoPath);
                    if (newConflictOutput.trim())
                        console.log(newConflictOutput);
                    continue;
                }
                // Non-conflict failure: abort just this commit and move on.
                console.log(chalk_1.default.dim(`  Cherry-pick --continue failed. Skipping ${sha}...`));
                logger.warn(`Cherry-pick --continue failed for ${sha}`, { repo: repoId, track, output: errMsg });
                await gitClient.cherryPickAbort(repoPath);
                break;
            }
        }
        else {
            logger.error(`Cherry-pick of ${sha} failed: ${result.error}`, { repo: repoId, track });
            return { shas: validShas, success: false, error: result.error };
        }
    }
    return { shas: validShas, success: true };
}
//# sourceMappingURL=cherry-pick.js.map