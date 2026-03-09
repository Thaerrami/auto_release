import { GitClient, RunContext } from './types';
import { Logger } from './logger';
export declare function pushChanges(repoPath: string, repoId: string, track: string, branch: string, newTag: string, gitClient: GitClient, context: RunContext, logger: Logger, tagAlreadyCreated?: boolean): Promise<{
    success: boolean;
    manual: boolean;
}>;
//# sourceMappingURL=push.d.ts.map