import { RunContext } from './types';
import { Logger } from './logger';
export declare function runInstall(repoPath: string, repoId: string, track: string, context: RunContext, logger: Logger): Promise<{
    success: boolean;
    skipped: boolean;
    aborted: boolean;
}>;
export declare function runBuild(repoPath: string, repoId: string, track: string, context: RunContext, logger: Logger): Promise<{
    success: boolean;
    skipped: boolean;
    aborted: boolean;
}>;
//# sourceMappingURL=build.d.ts.map