import { RunState, CompletedStep, StepName } from './types';
export declare class RunStateManager {
    private filePath;
    private state;
    constructor(logDir: string);
    getFilePath(): string;
    existsFromPreviousRun(): boolean;
    load(): RunState | null;
    init(runId: string, engineer: string, dryRun: boolean, selectedRepoIds: string[]): void;
    recordStep(repoId: string, track: string, step: StepName, result: 'success' | 'skipped' | 'failed', detail?: string): void;
    recordTagCreated(repoId: string, tag: string): void;
    isStepCompleted(repoId: string, track: string, step: StepName): boolean;
    getCompletedSteps(): CompletedStep[];
    getTagsCreated(): Record<string, string[]>;
    getCompletedCount(): number;
    getSelectedRepoIds(): string[];
    cleanup(): void;
    private writeAtomic;
}
//# sourceMappingURL=run-state.d.ts.map