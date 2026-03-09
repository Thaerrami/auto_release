import { RepoConfig, GitClient, RunContext } from './types';
import { Logger } from './logger';
export declare function showDiffSummary(repo: RepoConfig, prevTag: string, newTag: string, gitClient: GitClient, context: RunContext, logger: Logger): Promise<'push' | 'skip' | 'abort'>;
//# sourceMappingURL=diff-summary.d.ts.map