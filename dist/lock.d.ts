import { LockPayload } from './types';
import { Logger } from './logger';
export declare class LockManager {
    private lockPath;
    private infoPath;
    private release;
    constructor(lockPath: string);
    acquire(payload: LockPayload, logger: Logger): Promise<boolean>;
    private waitForLock;
    private writeInfo;
    private readInfo;
    releaseLock(logger: Logger): Promise<void>;
}
//# sourceMappingURL=lock.d.ts.map