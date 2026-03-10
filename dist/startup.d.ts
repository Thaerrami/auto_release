import { RepoConfig, RunContext, RepoResult } from './types';
import { Logger } from './logger';
import { RunStateManager } from './run-state';
export declare function validateRepoPaths(repos: RepoConfig[], logger: Logger): boolean;
/**
 * Detect the standing repo from CWD or --repo flag, then resolve the full
 * subtree (the repo + all its children/grandchildren).
 *
 * This matches the old codeUpdate.sh behavior:
 *   repo_name=$(basename "$(git rev-parse --show-toplevel)")
 *   if [ "$repo_name" = "ui-article" ]; then ... else ... UpgradeTheme2.sh ...
 *
 * The old script always started from the CWD repo and cascaded downward.
 *
 * Examples:
 *   CWD = ui-core  → processes: ui-core, ui-theme-photo, ui-theme-classic (hotfix: no ui-base, ui-products, ui-theme-nextgen)
 *   CWD = ui-base  → processes: ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic (no ui-products)
 *   CWD = ui-theme-photo → processes: ui-theme-photo (leaf, no children)
 *   CWD = ui-article → processes: ui-article (independent, no children)
 */
export declare function resolveReposFromContext(repoOverride: string | null, logger: Logger): Promise<RepoConfig[]>;
/**
 * Old selectRepos kept for resume / manual fallback. Now re-exported as
 * promptRepoSelection internally; the public API is resolveReposFromContext.
 */
export declare function selectRepos(logger: Logger): Promise<RepoConfig[]>;
export declare function handleCrashRecovery(stateManager: RunStateManager, logger: Logger): Promise<'resume' | 'fresh' | null>;
export declare function validateMainVersionTracks(selectedRepos: RepoConfig[], tracksPerRepo: Map<string, string[]>): string[];
export declare function printDryRunSummary(selectedRepos: RepoConfig[], results: RepoResult[], context: RunContext): void;
export declare function initRunContext(flags: {
    dryRun: boolean;
    verbose: boolean;
    noColor: boolean;
    logDir: string;
    lockPath: string;
}, engineer: string, runId: string, runStateFile: string, selectedRepos: RepoConfig[]): RunContext;
//# sourceMappingURL=startup.d.ts.map