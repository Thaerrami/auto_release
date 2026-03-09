import { LogEntry, RunLog, RepoResult } from './types';
export declare class Logger {
    private logDir;
    private logFile;
    private jsonFile;
    private stream;
    private entries;
    private timestamp;
    constructor(logDir: string);
    init(): void;
    getLogFilePath(): string;
    getJsonFilePath(): string;
    log(level: LogEntry['level'], message: string, extra?: Partial<LogEntry>): void;
    info(message: string, extra?: Partial<LogEntry>): void;
    warn(message: string, extra?: Partial<LogEntry>): void;
    error(message: string, extra?: Partial<LogEntry>): void;
    debug(message: string, extra?: Partial<LogEntry>): void;
    writeTextLine(line: string): void;
    writeJsonLog(runLog: RunLog): void;
    buildRunLog(runId: string, startedAt: string, engineer: string, dryRun: boolean, repoResults: RepoResult[]): RunLog;
    flush(): void;
    getEntries(): LogEntry[];
}
//# sourceMappingURL=logger.d.ts.map