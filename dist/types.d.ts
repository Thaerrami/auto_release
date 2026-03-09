export interface RepoConfig {
    id: string;
    layer: number;
    deps: string[];
    localPath: string;
    versioning: 'main' | 'independent';
    packageJsonDepKeys: Record<string, string>;
    baseBranch: string;
    gitRemoteUrl: string;
    consumesArticle: boolean;
}
export interface RunContext {
    dryRun: boolean;
    verbose: boolean;
    noColor: boolean;
    tagsCreated: Map<string, string[]>;
    logEntries: LogEntry[];
    runStateFile: string;
    logDir: string;
    lockPath: string;
    engineer: string;
    runId: string;
    startedAt: string;
    selectedRepos: RepoConfig[];
}
export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    repo?: string;
    track?: string;
    message: string;
    command?: string;
    output?: string;
}
export interface TrackResult {
    track: string;
    tagCreated: string | null;
    cherryPicks: string[];
    depsBumped: Record<string, string>;
    errors: string[];
    status: 'success' | 'partial' | 'failed' | 'skipped';
}
export interface RepoResult {
    repoId: string;
    tracksProcessed: string[];
    tagsCreated: string[];
    cherryPicks: string[];
    depsBumped: Record<string, string>;
    errors: string[];
    status: 'success' | 'partial' | 'failed' | 'skipped';
    stashed: boolean;
}
export interface RunLog {
    runId: string;
    startedAt: string;
    finishedAt: string;
    engineer: string;
    dryRun: boolean;
    repos: RepoResult[];
}
export interface RunState {
    runId: string;
    startedAt: string;
    engineer: string;
    dryRun: boolean;
    selectedRepoIds: string[];
    completedSteps: CompletedStep[];
    tagsCreated: Record<string, string[]>;
}
export interface CompletedStep {
    repoId: string;
    track: string;
    step: StepName;
    timestamp: string;
    result: 'success' | 'skipped' | 'failed';
    detail?: string;
}
export type StepName = 'dirty-check' | 'version-select' | 'compute-tag' | 'dep-bump' | 'cherry-pick' | 'npm-install' | 'npm-build' | 'diff-summary' | 'push';
export interface CLIFlags {
    dryRun: boolean;
    verbose: boolean;
    noColor: boolean;
    logDir: string;
    lockPath: string;
    repoOverride: string | null;
}
export interface TagInfo {
    tag: string;
    major: number;
    minor: number;
    patch: number;
    track: string;
    date?: string;
}
export interface LockPayload {
    pid: number;
    engineer: string;
    startedAt: string;
    reposSelected: string[];
}
export interface GitClient {
    status(repoPath: string): Promise<string>;
    stash(repoPath: string): Promise<string>;
    stashPop(repoPath: string): Promise<string>;
    stashList(repoPath: string): Promise<string>;
    tagList(repoPath: string): Promise<string[]>;
    tagCreate(repoPath: string, tag: string): Promise<void>;
    tagDelete(repoPath: string, tag: string): Promise<void>;
    tagDeleteRemote(repoPath: string, tag: string): Promise<void>;
    tagExistsRemote(repoPath: string, tag: string): Promise<boolean>;
    cherryPick(repoPath: string, shas: string[]): Promise<CherryPickResult>;
    cherryPickContinue(repoPath: string): Promise<CherryPickResult>;
    cherryPickSkip(repoPath: string): Promise<CherryPickResult>;
    cherryPickAbort(repoPath: string): Promise<void>;
    conflictFiles(repoPath: string): Promise<string>;
    log(repoPath: string, fromTag: string, toRef: string): Promise<CommitInfo[]>;
    logOneline(repoPath: string, fromTag: string, toRef: string): Promise<string>;
    logContains(repoPath: string, sha: string): Promise<boolean>;
    diffStat(repoPath: string, fromTag: string, toRef: string): Promise<DiffStats>;
    push(repoPath: string, branch: string): Promise<PushResult>;
    pushTag(repoPath: string, tag: string): Promise<PushResult>;
    pushAllTags(repoPath: string): Promise<PushResult>;
    pullRebase(repoPath: string, branch: string): Promise<string>;
    pull(repoPath: string): Promise<string>;
    fetchTags(repoPath: string): Promise<void>;
    fetchAll(repoPath: string): Promise<void>;
    checkout(repoPath: string, ref: string): Promise<void>;
    currentBranch(repoPath: string): Promise<string>;
    remoteExists(repoPath: string, remoteName: string): Promise<boolean>;
    setRemote(repoPath: string, remoteName: string, url: string): Promise<void>;
    commitAll(repoPath: string, message: string): Promise<void>;
    add(repoPath: string, files: string[]): Promise<void>;
    shaExists(repoPath: string, sha: string): Promise<boolean>;
    getConfigEmail(repoPath: string): Promise<string>;
    showTagDate(repoPath: string, tag: string): Promise<string>;
    getFileAtRef(repoPath: string, ref: string, filePath: string): Promise<string | null>;
    lsRemoteTags(repoPath: string, remoteUrl: string): Promise<string[]>;
    lsRemoteTagsFiltered(repoPath: string, remoteUrl: string, trackPrefix: string): Promise<string[]>;
}
export interface CherryPickResult {
    success: boolean;
    conflicting: boolean;
    conflictSha?: string;
    error?: string;
}
export interface CommitInfo {
    sha: string;
    message: string;
    author: string;
}
export interface DiffStats {
    filesChanged: number;
    insertions: number;
    deletions: number;
}
export interface PushResult {
    success: boolean;
    error?: string;
    errorType?: 'non-fast-forward' | 'auth' | 'protected-branch' | 'timeout' | 'unknown';
}
//# sourceMappingURL=types.d.ts.map