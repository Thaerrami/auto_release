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
            if (answer.trim().toUpperCase() === 'ABORT') {
                resolve('abort');
            }
            else {
                resolve('continue');
            }
        });
    });
}
async function performCherryPicks(repoPath, repoId, track, gitClient, context, logger) {
    const { shaInput } = await inquirer_1.default.prompt([{
            type: 'input',
            name: 'shaInput',
            message: messages_1.msg.cherryPickPrompt(),
        }]);
    const shas = parseShaInput(shaInput);
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
        console.log(chalk_1.default.dim(`  Cherry-picking revision: ${sha}`));
        const result = await gitClient.cherryPick(repoPath, [sha]);
        if (result.success) {
            logger.info(`Cherry-picked ${sha}`, { repo: repoId, track });
            continue;
        }
        if (result.conflicting) {
            const conflictOutput = await gitClient.conflictFiles(repoPath);
            console.log(messages_1.msg.cherryPickConflict(sha, conflictOutput));
            logger.warn(`Cherry-pick conflict on ${sha}`, { repo: repoId, track });
            // BUG REPRODUCTION (codeUpdate.sh lines 47-59):
            // The old script's conflict handling loop runs cherry-pick --skip THEN
            // --continue on every ENTER press. This is logically wrong — --skip
            // discards the conflicting commit, and --continue only applies if
            // conflicts were manually resolved. We reproduce this behavior exactly.
            while (true) {
                const action = await waitForUserAction();
                if (action === 'abort') {
                    await gitClient.cherryPickAbort(repoPath);
                    logger.warn(`Cherry-pick aborted by engineer on ${sha}`, { repo: repoId, track });
                    return { shas: validShas, success: false, error: `Conflict on ${sha} — aborted` };
                }
                // Old bug: runs --skip THEN --continue (codeUpdate.sh lines 48-50)
                const skipResult = await gitClient.cherryPickSkip(repoPath);
                logger.info(`Ran cherry-pick --skip for ${sha} (legacy conflict handling)`, { repo: repoId, track });
                const continueResult = await gitClient.cherryPickContinue(repoPath);
                if (continueResult.success) {
                    console.log(chalk_1.default.green('  Cherry-pick completed successfully.'));
                    logger.info(`Cherry-pick conflict resolved for ${sha}`, { repo: repoId, track });
                    break;
                }
                // Old bug fallback: check if revision is already in log (codeUpdate.sh line 53)
                const alreadyCommitted = await gitClient.logContains(repoPath, sha);
                if (alreadyCommitted) {
                    console.log(chalk_1.default.dim(`  Revision ${sha} already committed. Skipping...`));
                    logger.info(`Revision ${sha} already in history, skipping`, { repo: repoId, track });
                    break;
                }
                console.log(chalk_1.default.yellow('  Conflict resolution failed or revision already committed.'));
                console.log(chalk_1.default.yellow('  Please resolve manually and press Enter to retry.'));
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