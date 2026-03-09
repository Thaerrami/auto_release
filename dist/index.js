#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const chalk_1 = __importDefault(require("chalk"));
const uuid_1 = require("uuid");
const cli_1 = require("./cli");
const config_1 = require("./config");
const git_client_1 = require("./git-client");
const logger_1 = require("./logger");
const lock_1 = require("./lock");
const run_state_1 = require("./run-state");
const messages_1 = require("./messages");
const repo_flow_1 = require("./repo-flow");
const startup_1 = require("./startup");
async function main() {
    const flags = (0, cli_1.parseFlags)(process.argv);
    const gitClient = new git_client_1.RealGitClient();
    const logger = new logger_1.Logger(flags.logDir);
    const lockManager = new lock_1.LockManager(flags.lockPath);
    const stateManager = new run_state_1.RunStateManager(flags.logDir);
    if (flags.noColor) {
        (0, messages_1.setColorEnabled)(false);
    }
    logger.init();
    console.log(messages_1.msg.banner());
    if (flags.dryRun) {
        console.log(messages_1.msg.dryRunBanner());
    }
    logger.info('Release tool started', {
        command: `flags: ${JSON.stringify(flags)}`,
    });
    // Determine engineer identity (try CWD first, then first known repo)
    let engineer = 'unknown';
    try {
        engineer = await gitClient.getConfigEmail(process.cwd());
    }
    catch {
        try {
            engineer = await gitClient.getConfigEmail(config_1.REPOS[0].localPath);
        }
        catch {
            // fallback
        }
    }
    logger.info(`Engineer: ${engineer}`);
    // Crash recovery check
    let resumeRunId = null;
    let resumeTags = null;
    let resumeRepoIds = null;
    const recoveryAction = await (0, startup_1.handleCrashRecovery)(stateManager, logger);
    if (recoveryAction === 'resume') {
        logger.info('Resuming from previous run state');
        const prevState = stateManager.load();
        if (prevState) {
            resumeRunId = prevState.runId;
            resumeRepoIds = prevState.selectedRepoIds;
            resumeTags = new Map();
            for (const [repoId, tags] of Object.entries(prevState.tagsCreated)) {
                resumeTags.set(repoId, tags);
            }
        }
    }
    // Acquire lock (non-dry-run only)
    if (!flags.dryRun) {
        const lockPayload = {
            pid: process.pid,
            engineer,
            startedAt: new Date().toISOString(),
            reposSelected: [],
        };
        const lockAcquired = await lockManager.acquire(lockPayload, logger);
        if (!lockAcquired) {
            console.log('  Aborting: could not acquire lock.');
            logger.error('Startup aborted: lock not acquired');
            logger.flush();
            process.exit(1);
        }
    }
    // Register cleanup handlers
    const cleanup = async () => {
        if (!flags.dryRun) {
            await lockManager.releaseLock(logger);
        }
        logger.flush();
    };
    process.on('exit', () => {
        // sync-only cleanup
    });
    process.on('SIGINT', async () => {
        console.log('\n  Interrupted. Cleaning up...');
        logger.warn('Run interrupted (SIGINT)');
        await cleanup();
        process.exit(130);
    });
    process.on('SIGTERM', async () => {
        logger.warn('Run terminated (SIGTERM)');
        await cleanup();
        process.exit(143);
    });
    process.on('uncaughtException', async (err) => {
        logger.error(`Uncaught exception: ${err.message}`);
        console.error('\n  Fatal error:', err.message);
        await cleanup();
        process.exit(1);
    });
    // Repo resolution: detect standing repo from CWD (or --repo flag),
    // then walk the dependency tree downward to include all children.
    // On resume, use the saved repo list instead.
    let selectedRepos;
    if (resumeRepoIds) {
        selectedRepos = resumeRepoIds
            .map((id) => config_1.REPOS.find((r) => r.id === id))
            .filter((r) => r !== undefined);
        logger.info(`Resuming with repos: ${selectedRepos.map((r) => r.id).join(', ')}`);
    }
    else {
        selectedRepos = await (0, startup_1.resolveReposFromContext)(flags.repoOverride, logger);
    }
    // Validate that all resolved repo paths exist on disk
    console.log('\nValidating repo paths...\n');
    if (!(0, startup_1.validateRepoPaths)(selectedRepos, logger)) {
        logger.error('Startup aborted: missing repo paths');
        await cleanup();
        logger.flush();
        process.exit(1);
    }
    logger.info(`Selected repos: ${selectedRepos.map((r) => r.id).join(', ')}`);
    // Initialize run
    const runId = resumeRunId ?? (0, uuid_1.v4)();
    const context = (0, startup_1.initRunContext)(flags, engineer, runId, stateManager.getFilePath(), selectedRepos);
    if (resumeTags) {
        for (const [repoId, tags] of resumeTags) {
            context.tagsCreated.set(repoId, tags);
        }
    }
    if (!flags.dryRun && !resumeRunId) {
        stateManager.init(runId, engineer, flags.dryRun, selectedRepos.map((r) => r.id));
    }
    if (!flags.dryRun) {
        const updatedPayload = {
            pid: process.pid,
            engineer,
            startedAt: context.startedAt,
            reposSelected: selectedRepos.map((r) => r.id),
        };
        const infoPath = flags.lockPath + '.info';
        fs_1.default.writeFileSync(infoPath, JSON.stringify(updatedPayload, null, 2), 'utf-8');
    }
    // Process each repo in dependency order (standing repo first, then children)
    const results = [];
    let abortAll = false;
    for (const repo of selectedRepos) {
        if (abortAll) {
            results.push({
                repoId: repo.id,
                tracksProcessed: [],
                tagsCreated: [],
                cherryPicks: [],
                depsBumped: {},
                errors: ['Skipped due to abort all'],
                status: 'skipped',
                stashed: false,
            });
            continue;
        }
        const result = await (0, repo_flow_1.repoReleaseFlow)(repo, context, gitClient, logger, stateManager);
        results.push(result);
        if (result.errors.some((e) => e.includes('abort all'))) {
            abortAll = true;
            logger.warn('Abort all triggered — skipping remaining repos');
        }
        // After processing a head repo, announce that children come next
        if ((repo.id === 'ui-base' || repo.id === 'ui-core') && result.tagsCreated.length > 0) {
            const remaining = selectedRepos.filter((r) => r.deps.includes(repo.id) && !results.some((res) => res.repoId === r.id));
            if (remaining.length > 0) {
                console.log(chalk_1.default.cyan(`\n  All tags processed for ${repo.id}. Next: update ${remaining.map((r) => r.id).join(', ')}.`));
                logger.info(`Head repo ${repo.id} completed — processing children: ${remaining.map((r) => r.id).join(', ')}`);
            }
            for (const tag of result.tagsCreated) {
                const bugTag = 'test' + tag.replace(/^v/, '');
                console.log(messages_1.msg.legacyTestPrefix(bugTag));
                logger.warn(`[legacy-bug] UpgradeTheme2.sh would have created tag "${bugTag}" instead of "${tag}"`, { repo: repo.id });
            }
        }
        // Article cascade notice
        if (repo.id === 'ui-article' && result.tagsCreated.length > 0) {
            console.log(messages_1.msg.consumeThemesBeforeDefine());
            logger.warn('[legacy-bug] consumeThemes() called before function definition in upgradeArticle.sh');
            console.log(messages_1.msg.articleCascade());
            logger.info('Cascading ui-article version into consuming repos');
        }
    }
    // Final summary
    if (flags.dryRun) {
        (0, startup_1.printDryRunSummary)(selectedRepos, results, context);
    }
    printFinalSummary(results);
    // Write JSON log
    const runLog = logger.buildRunLog(runId, context.startedAt, engineer, flags.dryRun, results);
    logger.writeJsonLog(runLog);
    // Cleanup
    if (!flags.dryRun) {
        stateManager.cleanup();
    }
    await cleanup();
    console.log(messages_1.msg.runComplete());
    console.log(messages_1.msg.runSummary(logger.getLogFilePath(), logger.getJsonFilePath()));
}
function printFinalSummary(results) {
    console.log(chalk_1.default.cyan.bold('\n═══════════════════════════════════════════'));
    console.log(chalk_1.default.cyan.bold('  FINAL SUMMARY'));
    console.log(chalk_1.default.cyan.bold('═══════════════════════════════════════════\n'));
    for (const r of results) {
        const statusColor = r.status === 'success' ? chalk_1.default.green
            : r.status === 'partial' ? chalk_1.default.yellow
                : r.status === 'skipped' ? chalk_1.default.dim
                    : chalk_1.default.red;
        console.log(`  ${statusColor(r.status.toUpperCase().padEnd(8))} ${chalk_1.default.white.bold(r.repoId)}`);
        if (r.tagsCreated.length > 0) {
            console.log(`           Tags: ${chalk_1.default.green(r.tagsCreated.join(', '))}`);
        }
        if (r.errors.length > 0) {
            for (const err of r.errors) {
                console.log(`           ${chalk_1.default.red('Error: ' + err)}`);
            }
        }
    }
    console.log('');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map