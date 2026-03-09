"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunStateManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class RunStateManager {
    constructor(logDir) {
        this.state = null;
        this.filePath = path_1.default.join(logDir, 'run-state.json');
    }
    getFilePath() {
        return this.filePath;
    }
    existsFromPreviousRun() {
        return fs_1.default.existsSync(this.filePath);
    }
    load() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                const data = fs_1.default.readFileSync(this.filePath, 'utf-8');
                this.state = JSON.parse(data);
                return this.state;
            }
        }
        catch {
            // corrupt file
        }
        return null;
    }
    init(runId, engineer, dryRun, selectedRepoIds) {
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
    recordStep(repoId, track, step, result, detail) {
        if (!this.state)
            return;
        const entry = {
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
    recordTagCreated(repoId, tag) {
        if (!this.state)
            return;
        if (!this.state.tagsCreated[repoId]) {
            this.state.tagsCreated[repoId] = [];
        }
        this.state.tagsCreated[repoId].push(tag);
        this.writeAtomic();
    }
    isStepCompleted(repoId, track, step) {
        if (!this.state)
            return false;
        return this.state.completedSteps.some((s) => s.repoId === repoId && s.track === track && s.step === step && s.result === 'success');
    }
    getCompletedSteps() {
        return this.state?.completedSteps ?? [];
    }
    getTagsCreated() {
        return this.state?.tagsCreated ?? {};
    }
    getCompletedCount() {
        return this.state?.completedSteps.length ?? 0;
    }
    getSelectedRepoIds() {
        return this.state?.selectedRepoIds ?? [];
    }
    cleanup() {
        try {
            if (fs_1.default.existsSync(this.filePath)) {
                fs_1.default.unlinkSync(this.filePath);
            }
        }
        catch {
            // ignore
        }
        this.state = null;
    }
    writeAtomic() {
        if (!this.state)
            return;
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        const tmpPath = this.filePath + '.tmp.' + process.pid + '.' + os_1.default.hostname();
        fs_1.default.writeFileSync(tmpPath, JSON.stringify(this.state, null, 2), 'utf-8');
        fs_1.default.renameSync(tmpPath, this.filePath);
    }
}
exports.RunStateManager = RunStateManager;
//# sourceMappingURL=run-state.js.map