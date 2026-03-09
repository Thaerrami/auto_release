"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Logger {
    constructor(logDir) {
        this.stream = null;
        this.entries = [];
        this.logDir = logDir;
        this.timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        this.logFile = path_1.default.join(logDir, `release-${this.timestamp}.log`);
        this.jsonFile = path_1.default.join(logDir, `release-${this.timestamp}.json`);
    }
    init() {
        if (!fs_1.default.existsSync(this.logDir)) {
            fs_1.default.mkdirSync(this.logDir, { recursive: true });
        }
        this.stream = fs_1.default.createWriteStream(this.logFile, { flags: 'a' });
    }
    getLogFilePath() {
        return this.logFile;
    }
    getJsonFilePath() {
        return this.jsonFile;
    }
    log(level, message, extra) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...extra,
        };
        this.entries.push(entry);
        const prefix = level.toUpperCase().padEnd(5);
        const repoTag = entry.repo ? `[${entry.repo}]` : '';
        const trackTag = entry.track ? `[${entry.track}]` : '';
        const line = `${entry.timestamp} ${prefix} ${repoTag}${trackTag} ${message}`;
        if (this.stream) {
            this.stream.write(line + '\n');
            if (entry.command) {
                this.stream.write(`  CMD: ${entry.command}\n`);
            }
            if (entry.output) {
                this.stream.write(`  OUT: ${entry.output}\n`);
            }
        }
    }
    info(message, extra) {
        this.log('info', message, extra);
    }
    warn(message, extra) {
        this.log('warn', message, extra);
    }
    error(message, extra) {
        this.log('error', message, extra);
    }
    debug(message, extra) {
        this.log('debug', message, extra);
    }
    writeTextLine(line) {
        if (this.stream) {
            this.stream.write(line + '\n');
        }
    }
    writeJsonLog(runLog) {
        fs_1.default.writeFileSync(this.jsonFile, JSON.stringify(runLog, null, 2), 'utf-8');
    }
    buildRunLog(runId, startedAt, engineer, dryRun, repoResults) {
        return {
            runId,
            startedAt,
            finishedAt: new Date().toISOString(),
            engineer,
            dryRun,
            repos: repoResults,
        };
    }
    flush() {
        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }
    }
    getEntries() {
        return [...this.entries];
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map