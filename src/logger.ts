import fs from 'fs';
import path from 'path';
import { LogEntry, RunLog, RepoResult } from './types';

export class Logger {
  private logDir: string;
  private logFile: string;
  private jsonFile: string;
  private stream: fs.WriteStream | null = null;
  private entries: LogEntry[] = [];
  private timestamp: string;

  constructor(logDir: string) {
    this.logDir = logDir;
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    this.logFile = path.join(logDir, `release-${this.timestamp}.log`);
    this.jsonFile = path.join(logDir, `release-${this.timestamp}.json`);
  }

  init(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    this.stream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  getLogFilePath(): string {
    return this.logFile;
  }

  getJsonFilePath(): string {
    return this.jsonFile;
  }

  log(level: LogEntry['level'], message: string, extra?: Partial<LogEntry>): void {
    const entry: LogEntry = {
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

  info(message: string, extra?: Partial<LogEntry>): void {
    this.log('info', message, extra);
  }

  warn(message: string, extra?: Partial<LogEntry>): void {
    this.log('warn', message, extra);
  }

  error(message: string, extra?: Partial<LogEntry>): void {
    this.log('error', message, extra);
  }

  debug(message: string, extra?: Partial<LogEntry>): void {
    this.log('debug', message, extra);
  }

  writeTextLine(line: string): void {
    if (this.stream) {
      this.stream.write(line + '\n');
    }
  }

  writeJsonLog(runLog: RunLog): void {
    fs.writeFileSync(this.jsonFile, JSON.stringify(runLog, null, 2), 'utf-8');
  }

  buildRunLog(
    runId: string,
    startedAt: string,
    engineer: string,
    dryRun: boolean,
    repoResults: RepoResult[]
  ): RunLog {
    return {
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      engineer,
      dryRun,
      repos: repoResults,
    };
  }

  flush(): void {
    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }
}
