import fs from 'fs';
import path from 'path';
import os from 'os';
import { RunState, CompletedStep, StepName } from './types';

export class RunStateManager {
  private filePath: string;
  private state: RunState | null = null;

  constructor(logDir: string) {
    this.filePath = path.join(logDir, 'run-state.json');
  }

  getFilePath(): string {
    return this.filePath;
  }

  existsFromPreviousRun(): boolean {
    return fs.existsSync(this.filePath);
  }

  load(): RunState | null {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        this.state = JSON.parse(data) as RunState;
        return this.state;
      }
    } catch {
      // corrupt file
    }
    return null;
  }

  init(runId: string, engineer: string, dryRun: boolean, selectedRepoIds: string[]): void {
    this.state = {
      runId,
      startedAt: new Date().toISOString(),
      engineer,
      dryRun,
      selectedRepoIds,
      completedSteps: [],
      tagsCreated: {},
    };
    this.writeAtomic();
  }

  recordStep(
    repoId: string,
    track: string,
    step: StepName,
    result: 'success' | 'skipped' | 'failed',
    detail?: string
  ): void {
    if (!this.state) return;

    const entry: CompletedStep = {
      repoId,
      track,
      step,
      timestamp: new Date().toISOString(),
      result,
      detail,
    };
    this.state.completedSteps.push(entry);
    this.writeAtomic();
  }

  recordTagCreated(repoId: string, tag: string): void {
    if (!this.state) return;
    if (!this.state.tagsCreated[repoId]) {
      this.state.tagsCreated[repoId] = [];
    }
    this.state.tagsCreated[repoId].push(tag);
    this.writeAtomic();
  }

  isStepCompleted(repoId: string, track: string, step: StepName): boolean {
    if (!this.state) return false;
    return this.state.completedSteps.some(
      (s) => s.repoId === repoId && s.track === track && s.step === step && s.result === 'success'
    );
  }

  getCompletedSteps(): CompletedStep[] {
    return this.state?.completedSteps ?? [];
  }

  getTagsCreated(): Record<string, string[]> {
    return this.state?.tagsCreated ?? {};
  }

  getCompletedCount(): number {
    return this.state?.completedSteps.length ?? 0;
  }

  getSelectedRepoIds(): string[] {
    return this.state?.selectedRepoIds ?? [];
  }

  cleanup(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        fs.unlinkSync(this.filePath);
      }
    } catch {
      // ignore
    }
    this.state = null;
  }

  private writeAtomic(): void {
    if (!this.state) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = this.filePath + '.tmp.' + process.pid + '.' + os.hostname();
    fs.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}
