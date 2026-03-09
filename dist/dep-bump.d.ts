import { RepoConfig, RunContext, GitClient } from './types';
import { Logger } from './logger';
export declare function bumpParentDependency(repo: RepoConfig, track: string, context: RunContext, gitClient: GitClient, logger: Logger): Promise<Record<string, string>>;
//# sourceMappingURL=dep-bump.d.ts.map