import fs from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';
import inquirer from 'inquirer';
import { LockPayload } from './types';
import { msg } from './messages';
import { Logger } from './logger';

export class LockManager {
  private lockPath: string;
  private infoPath: string;
  private release: (() => Promise<void>) | null = null;

  constructor(lockPath: string) {
    this.lockPath = lockPath;
    this.infoPath = lockPath + '.info';
  }

  async acquire(payload: LockPayload, logger: Logger): Promise<boolean> {
    const lockDir = path.dirname(this.lockPath);
    if (!fs.existsSync(lockDir)) {
      fs.mkdirSync(lockDir, { recursive: true });
    }

    if (!fs.existsSync(this.lockPath)) {
      fs.writeFileSync(this.lockPath, '', 'utf-8');
    }

    let locked = false;
    try {
      locked = await lockfile.check(this.lockPath);
    } catch {
      locked = false;
    }

    if (locked) {
      const existing = this.readInfo();
      if (existing) {
        console.log(msg.lockHeld(existing.engineer, existing.startedAt, existing.reposSelected));
      } else {
        console.log(msg.lockHeld('unknown', 'unknown', []));
      }
      console.log(msg.lockActions());

      const { action } = await inquirer.prompt<{ action: string }>([{
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
          await lockfile.unlock(this.lockPath);
        } catch {
          // stale lock or already released
        }
      }
    }

    try {
      this.release = await lockfile.lock(this.lockPath, {
        retries: { retries: 3, minTimeout: 500, maxTimeout: 2000 },
        stale: 300000, // 5 minutes
      });
      this.writeInfo(payload);
      logger.info('Lock acquired');
      return true;
    } catch (err) {
      logger.error(`Failed to acquire lock: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private async waitForLock(payload: LockPayload, logger: Logger): Promise<boolean> {
    const maxAttempts = 60; // 10 minutes max
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`  Waiting for lock... (attempt ${attempt + 1})`);
      await sleep(10000);

      let stillLocked = false;
      try {
        stillLocked = await lockfile.check(this.lockPath);
      } catch {
        stillLocked = false;
      }

      if (!stillLocked) {
        try {
          this.release = await lockfile.lock(this.lockPath, {
            retries: { retries: 3, minTimeout: 500, maxTimeout: 2000 },
            stale: 300000,
          });
          this.writeInfo(payload);
          logger.info('Lock acquired after waiting');
          return true;
        } catch {
          continue;
        }
      }
    }

    logger.error('Timed out waiting for lock');
    return false;
  }

  private writeInfo(payload: LockPayload): void {
    fs.writeFileSync(this.infoPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private readInfo(): LockPayload | null {
    try {
      if (fs.existsSync(this.infoPath)) {
        return JSON.parse(fs.readFileSync(this.infoPath, 'utf-8')) as LockPayload;
      }
    } catch {
      // corrupt info file
    }
    return null;
  }

  async releaseLock(logger: Logger): Promise<void> {
    try {
      if (this.release) {
        await this.release();
        this.release = null;
      }
      if (fs.existsSync(this.infoPath)) {
        fs.unlinkSync(this.infoPath);
      }
      logger.info('Lock released');
    } catch (err) {
      logger.warn(`Failed to release lock cleanly: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
