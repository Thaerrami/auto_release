import { GitClient, RunContext } from './types';
import { Logger } from './logger';
export declare function parseShaInput(input: string): string[];
export declare function performCherryPicks(repoPath: string, repoId: string, track: string, gitClient: GitClient, context: RunContext, logger: Logger): Promise<{
    shas: string[];
    success: boolean;
    error?: string;
}>;
//# sourceMappingURL=cherry-pick.d.ts.map