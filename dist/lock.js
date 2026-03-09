"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const proper_lockfile_1 = __importDefault(require("proper-lockfile"));
const inquirer_1 = __importDefault(require("inquirer"));
const messages_1 = require("./messages");
class LockManager {
    constructor(lockPath) {
        this.release = null;
        this.lockPath = lockPath;
        this.infoPath = lockPath + '.info';
    }
    async acquire(payload, logger) {
        const lockDir = path_1.default.dirname(this.lockPath);
        if (!fs_1.default.existsSync(lockDir)) {
            fs_1.default.mkdirSync(lockDir, { recursive: true });
        }
        if (!fs_1.default.existsSync(this.lockPath)) {
            fs_1.default.writeFileSync(this.lockPath, '', 'utf-8');
        }
        let locked = false;
        try {
            locked = await proper_lockfile_1.default.check(this.lockPath);
        }
        catch {
            locked = false;
        }
        if (locked) {
            const existing = this.readInfo();
            if (existing) {
                console.log(messages_1.msg.lockHeld(existing.engineer, existing.startedAt, existing.reposSelected));
            }
            else {
                console.log(messages_1.msg.lockHeld('unknown', 'unknown', []));
            }
            console.log(messages_1.msg.lockActions());
            const { action } = await inquirer_1.default.prompt([{
                    type: 'list',
                    name: 'action',
                    message: 'Choose action:',
                    choices: [
                        { name: '[W] Wait (poll every 10s)', value: 'wait' },
                        { name: '[F] Force override', value: 'force' },
                        { name: '[A] Abort', value: 'abort' },
                    ],
                }]);
            if (action === 'abort') {
                return false;
            }
            if (action === 'wait') {
                return this.waitForLock(payload, logger);
            }
            if (action === 'force') {
                logger.warn('Force-overriding existing lock');
                try {
                    await proper_lockfile_1.default.unlock(this.lockPath);
                }
                catch {
                    // stale lock or already released
                }
            }
        }
        try {
            this.release = await proper_lockfile_1.default.lock(this.lockPath, {
                retries: { retries: 3, minTimeout: 500, maxTimeout: 2000 },
                stale: 300000, // 5 minutes
            });
            this.writeInfo(payload);
            logger.info('Lock acquired');
            return true;
        }
        catch (err) {
            logger.error(`Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }
    async waitForLock(payload, logger) {
        const maxAttempts = 60; // 10 minutes max
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            console.log(`  Waiting for lock... (attempt ${attempt + 1})`);
            await sleep(10000);
            let stillLocked = false;
            try {
                stillLocked = await proper_lockfile_1.default.check(this.lockPath);
            }
            catch {
                stillLocked = false;
            }
            if (!stillLocked) {
                try {
                    this.release = await proper_lockfile_1.default.lock(this.lockPath, {
                        retries: { retries: 3, minTimeout: 500, maxTimeout: 2000 },
                        stale: 300000,
                    });
                    this.writeInfo(payload);
                    logger.info('Lock acquired after waiting');
                    return true;
                }
                catch {
                    continue;
                }
            }
        }
        logger.error('Timed out waiting for lock');
        return false;
    }
    writeInfo(payload) {
        fs_1.default.writeFileSync(this.infoPath, JSON.stringify(payload, null, 2), 'utf-8');
    }
    readInfo() {
        try {
            if (fs_1.default.existsSync(this.infoPath)) {
                return JSON.parse(fs_1.default.readFileSync(this.infoPath, 'utf-8'));
            }
        }
        catch {
            // corrupt info file
        }
        return null;
    }
    async releaseLock(logger) {
        try {
            if (this.release) {
                await this.release();
                this.release = null;
            }
            if (fs_1.default.existsSync(this.infoPath)) {
                fs_1.default.unlinkSync(this.infoPath);
            }
            logger.info('Lock released');
        }
        catch (err) {
            logger.warn(`Failed to release lock cleanly: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
exports.LockManager = LockManager;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=lock.js.map