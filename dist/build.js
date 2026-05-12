"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInstall = runInstall;
exports.runBuild = runBuild;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const execa = require("execa");
const inquirer_1 = __importDefault(require("inquirer"));
const messages_1 = require("./messages");
function detectPackageManager(repoPath) {
    if (fs_1.default.existsSync(path_1.default.join(repoPath, 'yarn.lock')))
        return 'yarn';
    return 'npm';
}
async function waitForRetryAction() {
    return new Promise((resolve) => {
        const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('  > ', (answer) => {
            rl.close();
            const upper = answer.trim().toUpperCase();
            if (upper === 'ABORT') {
                resolve('abort');
            }
            else if (upper === 'SKIP') {
                resolve('skip');
            }
            else {
                resolve('retry');
            }
        });
    });
}
async function promptRunStep(promptMsg) {
    const { run } = await inquirer_1.default.prompt([{
            type: 'list',
            name: 'run',
            message: promptMsg,
            choices: [
                { name: '[Y] Yes, run it', value: 'yes' },
                { name: '[S] Skip', value: 'skip' },
            ],
        }]);
    return run === 'yes';
}
async function runInstall(repoPath, repoId, track, context, logger) {
    if (context.dryRun) {
        const pm = detectPackageManager(repoPath);
        console.log(messages_1.msg.dryRunSkip(`${pm} install`));
        logger.info(`[DRY-RUN] Would run ${pm} install`, { repo: repoId, track });
        return { success: true, skipped: false, aborted: false };
    }
    if (context.skipInstallBuild) {
        logger.info('npm install skipped (--skip-install-build)', { repo: repoId, track });
        return { success: true, skipped: true, aborted: false };
    }
    const shouldRun = await promptRunStep('Run npm install?');
    if (!shouldRun) {
        logger.info('npm install skipped by engineer', { repo: repoId, track });
        return { success: true, skipped: true, aborted: false };
    }
    const pm = detectPackageManager(repoPath);
    const installCmd = pm === 'yarn' ? 'yarn' : 'npm';
    const installArgs = pm === 'yarn' ? ['install'] : ['install'];
    while (true) {
        console.log(messages_1.msg.installRunning(repoId));
        try {
            const result = await execa(installCmd, installArgs, {
                cwd: repoPath,
                stdio: context.verbose ? 'inherit' : 'pipe',
                reject: true,
            });
            if (!context.verbose && result.stdout) {
                logger.debug(`${pm} install output`, { repo: repoId, track, output: result.stdout });
            }
            logger.info(`${pm} install succeeded`, { repo: repoId, track });
            return { success: true, skipped: false, aborted: false };
        }
        catch (err) {
            const errOutput = err instanceof Error ? err.message : String(err);
            console.log(messages_1.msg.installFailed(errOutput));
            logger.error(`${pm} install failed`, { repo: repoId, track, output: errOutput });
            const action = await waitForRetryAction();
            if (action === 'abort') {
                logger.warn(`${pm} install aborted by engineer`, { repo: repoId, track });
                return { success: false, skipped: false, aborted: true };
            }
            if (action === 'skip') {
                logger.warn(`${pm} install skipped after failure`, { repo: repoId, track });
                return { success: false, skipped: true, aborted: false };
            }
        }
    }
}
async function runBuild(repoPath, repoId, track, context, logger) {
    if (context.dryRun) {
        const pm = detectPackageManager(repoPath);
        console.log(messages_1.msg.dryRunSkip(`${pm} run build`));
        logger.info(`[DRY-RUN] Would run ${pm} run build`, { repo: repoId, track });
        return { success: true, skipped: false, aborted: false };
    }
    if (context.skipInstallBuild) {
        logger.info('npm build skipped (--skip-install-build)', { repo: repoId, track });
        return { success: true, skipped: true, aborted: false };
    }
    const shouldRun = await promptRunStep('Run npm run build?');
    if (!shouldRun) {
        logger.info('npm build skipped by engineer', { repo: repoId, track });
        return { success: true, skipped: true, aborted: false };
    }
    const pm = detectPackageManager(repoPath);
    const buildCmd = pm === 'yarn' ? 'yarn' : 'npm';
    const buildArgs = pm === 'yarn' ? ['build'] : ['run', 'build'];
    while (true) {
        console.log(messages_1.msg.buildRunning(repoId));
        try {
            const result = await execa(buildCmd, buildArgs, {
                cwd: repoPath,
                stdio: context.verbose ? 'inherit' : 'pipe',
                reject: true,
            });
            if (!context.verbose && result.stdout) {
                logger.debug(`${pm} build output`, { repo: repoId, track, output: result.stdout });
            }
            logger.info(`${pm} build succeeded`, { repo: repoId, track });
            return { success: true, skipped: false, aborted: false };
        }
        catch (err) {
            const errOutput = err instanceof Error ? err.message : String(err);
            console.log(messages_1.msg.buildFailed(errOutput));
            logger.error(`${pm} build failed`, { repo: repoId, track, output: errOutput });
            const action = await waitForRetryAction();
            if (action === 'abort') {
                logger.warn(`${pm} build aborted by engineer`, { repo: repoId, track });
                return { success: false, skipped: false, aborted: true };
            }
            if (action === 'skip') {
                logger.warn(`${pm} build skipped after failure`, { repo: repoId, track });
                return { success: false, skipped: true, aborted: false };
            }
        }
    }
}
//# sourceMappingURL=build.js.map