import { RepoConfig, RunContext, GitClient, RepoResult } from './types';
import { Logger } from './logger';
import { RunStateManager } from './run-state';
export declare function repoReleaseFlow(repo: RepoConfig, context: RunContext, gitClient: GitClient, logger: Logger, stateManager: RunStateManager): Promise<RepoResult>;
//# sourceMappingURL=repo-flow.d.ts.map