"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = __importDefault(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const cli_1 = require("./cli");
const messages_1 = require("./messages");
const logger_1 = require("./logger");
const run_state_1 = require("./run-state");
const lock_1 = require("./lock");
const git_client_1 = require("./git-client");
const config_1 = require("./config");
const startup_1 = require("./startup");
const repo_flow_1 = require("./repo-flow");
async function main() {
    const flags = (0, cli_1.parseFlags)(process.argv);
    const logger = new logger_1.Logger(flags.logDir);
    logger.init();
    console.log(messages_1.msg.banner());
    if (flags.dryRun) {
        console.log(messages_1.msg.dryRunBanner());
    }
    if (flags.skipInstallBuild) {
        console.log(chalk_1.default.dim('  --skip-install-build: install and build are skipped for every repo (no prompts).\n'));
    }
    if (flags.autoPush) {
        console.log(chalk_1.default.dim('  --auto-push: after each diff summary, push runs without the push/skip/abort prompt.\n'));
    }
    const gitClient = new git_client_1.RealGitClient();
    const engineer = await gitClient.getConfigEmail(process.cwd());
    const runId = `${os_1.default.hostname()}-${process.pid}`;
    const stateManager = new run_state_1.RunStateManager(flags.logDir);
    const recoveryAction = await (0, startup_1.handleCrashRecovery)(stateManager, logger);
    let selectedRepos;
    if (recoveryAction === 'resume') {
        // stateManager.load() has already been called inside handleCrashRecovery()
        const ids = stateManager.getSelectedRepoIds();
        selectedRepos = ids
            .map((id) => (0, config_1.getRepoById)(id))
            .filter((r) => Boolean(r));
        selectedRepos = (0, config_1.sortReposByDependencyOrder)(selectedRepos);
    }
    else {
        selectedRepos = await (0, startup_1.resolveReposFromContext)(flags.repoOverride, logger);
    }
    const runStateFile = stateManager.getFilePath();
    if (recoveryAction !== 'resume') {
        stateManager.init(runId, engineer, flags.dryRun, selectedRepos.map((r) => r.id));
    }
    const context = (0, startup_1.initRunContext)(flags, engineer, runId, runStateFile, selectedRepos);
    const validPaths = (0, startup_1.validateRepoPaths)(selectedRepos, logger);
    if (!validPaths) {
        logger.flush();
        process.exit(1);
    }
    const lockManager = new lock_1.LockManager(flags.lockPath);
    let lockAcquired = true;
    if (!flags.dryRun) {
        lockAcquired = await lockManager.acquire({
            pid: process.pid,
            engineer,
            startedAt: context.startedAt,
            reposSelected: selectedRepos.map((r) => r.id),
        }, logger);
    }
    if (!lockAcquired) {
        logger.flush();
        process.exit(1);
    }
    const results = [];
    let completedSuccessfully = false;
    try {
        for (const repo of selectedRepos) {
            if (repo.excludeFromRelease) {
                logger.info(`Repo excluded from release: ${repo.id}`, { repo: repo.id });
                continue;
            }
            const repoResult = await (0, repo_flow_1.repoReleaseFlow)(repo, context, gitClient, logger, stateManager);
            results.push(repoResult);
        }
        console.log(messages_1.msg.runComplete());
        console.log(messages_1.msg.runSummary(logger.getLogFilePath(), logger.getJsonFilePath()));
        completedSuccessfully = true;
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(chalk_1.default.red(`\nFatal error: ${errMsg}\n`));
        logger.error(`Fatal error: ${errMsg}`);
        throw err;
    }
    finally {
        try {
            const runLog = logger.buildRunLog(runId, context.startedAt, engineer, flags.dryRun, results);
            logger.writeJsonLog(runLog);
        }
        catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.warn(`Failed to write JSON log: ${errMsg}`);
        }
        if (!flags.dryRun) {
            await lockManager.releaseLock(logger);
        }
        logger.flush();
    }
    // A successful run clears crash-recovery state (including when resuming).
    if (completedSuccessfully) {
        stateManager.cleanup();
    }
}
main().catch(() => {
    process.exit(1);
});
//# sourceMappingURL=index.js.map