import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import {
  GitClient,
  CherryPickResult,
  CommitInfo,
  DiffStats,
  PushResult,
} from './types';

export class RealGitClient implements GitClient {
  private getGit(repoPath: string): SimpleGit {
    const options: Partial<SimpleGitOptions> = {
      baseDir: repoPath,
      binary: 'git',
      maxConcurrentProcesses: 1,
    };
    return simpleGit(options);
  }

  async status(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['status', '--porcelain']);
  }

  async stash(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['stash']);
  }

  async stashPop(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['stash', 'pop']);
  }

  async stashList(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['stash', 'list']);
  }

  async tagList(repoPath: string): Promise<string[]> {
    const git = this.getGit(repoPath);
    const result = await git.tags();
    return result.all;
  }

  async tagCreate(repoPath: string, tag: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.addTag(tag);
  }

  async tagDelete(repoPath: string, tag: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.raw(['tag', '-d', tag]);
  }

  async tagDeleteRemote(repoPath: string, tag: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.raw(['push', 'origin', '--delete', tag]);
  }

  async tagExistsRemote(repoPath: string, tag: string): Promise<boolean> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Returns true if the commit has two parents (i.e. is a merge commit).
   * Cherry-picking a merge requires -m 1 to specify the mainline parent.
   */
  async isMergeCommit(repoPath: string, sha: string): Promise<boolean> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['rev-parse', '--verify', `${sha}^2`]);
      return true;
    } catch {
      return false;
    }
  }

  async cherryPick(repoPath: string, shas: string[]): Promise<CherryPickResult> {
    const git = this.getGit(repoPath);
    try {
      for (const sha of shas) {
        const isMerge = await this.isMergeCommit(repoPath, sha);
        const args = isMerge ? ['cherry-pick', '-m', '1', sha] : ['cherry-pick', sha];
        await git.raw(args);
      }
      return { success: true, conflicting: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('conflict') || errMsg.includes('CONFLICT') || errMsg.includes('could not apply')) {
        const conflictSha = shas.length === 1 ? shas[0] : undefined;
        return { success: false, conflicting: true, conflictSha, error: errMsg };
      }
      return { success: false, conflicting: false, error: errMsg };
    }
  }

  async cherryPickContinue(repoPath: string): Promise<CherryPickResult> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['cherry-pick', '--continue']);
      return { success: true, conflicting: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, conflicting: errMsg.includes('conflict'), error: errMsg };
    }
  }

  async cherryPickSkip(repoPath: string): Promise<CherryPickResult> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['cherry-pick', '--skip']);
      return { success: true, conflicting: false };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return { success: false, conflicting: errMsg.includes('conflict'), error: errMsg };
    }
  }

  async cherryPickAbort(repoPath: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.raw(['cherry-pick', '--abort']);
  }

  async conflictFiles(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    try {
      return await git.raw(['diff', '--name-only', '--diff-filter=U']);
    } catch {
      return '';
    }
  }

  async log(repoPath: string, fromTag: string, toRef: string): Promise<CommitInfo[]> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw([
        'log',
        `${fromTag}..${toRef}`,
        '--pretty=format:%H|||%s|||%an',
      ]);
      if (!result.trim()) return [];
      return result.trim().split('\n').map((line) => {
        const [sha, message, author] = line.split('|||');
        return { sha: sha.slice(0, 7), message, author };
      });
    } catch {
      return [];
    }
  }

  async logOneline(repoPath: string, fromTag: string, toRef: string): Promise<string> {
    const git = this.getGit(repoPath);
    try {
      return await git.raw(['log', `${fromTag}..${toRef}`, '--oneline']);
    } catch {
      return '';
    }
  }

  async logContains(repoPath: string, sha: string): Promise<boolean> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['log', '--oneline']);
      return result.includes(sha.slice(0, 7));
    } catch {
      return false;
    }
  }

  async diffStat(repoPath: string, fromTag: string, toRef: string): Promise<DiffStats> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['diff', '--stat', `${fromTag}..${toRef}`]);
      const summaryLine = result.trim().split('\n').pop() ?? '';
      const filesMatch = summaryLine.match(/(\d+)\s+files?\s+changed/);
      const insertMatch = summaryLine.match(/(\d+)\s+insertions?\(\+\)/);
      const deleteMatch = summaryLine.match(/(\d+)\s+deletions?\(-\)/);
      return {
        filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
        insertions: insertMatch ? parseInt(insertMatch[1], 10) : 0,
        deletions: deleteMatch ? parseInt(deleteMatch[1], 10) : 0,
      };
    } catch {
      return { filesChanged: 0, insertions: 0, deletions: 0 };
    }
  }

  async push(repoPath: string, branch: string): Promise<PushResult> {
    const git = this.getGit(repoPath);
    try {
      await git.push('origin', branch);
      return { success: true };
    } catch (err) {
      return this.classifyPushError(err);
    }
  }

  async pushTag(repoPath: string, tag: string): Promise<PushResult> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['push', 'origin', tag]);
      return { success: true };
    } catch (err) {
      return this.classifyPushError(err);
    }
  }

  async pushAllTags(repoPath: string): Promise<PushResult> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['push', 'origin', '--tags']);
      return { success: true };
    } catch (err) {
      return this.classifyPushError(err);
    }
  }

  private classifyPushError(err: unknown): PushResult {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('non-fast-forward') || errMsg.includes('rejected')) {
      return { success: false, error: errMsg, errorType: 'non-fast-forward' };
    }
    if (errMsg.includes('auth') || errMsg.includes('Permission') || errMsg.includes('403') || errMsg.includes('401')) {
      return { success: false, error: errMsg, errorType: 'auth' };
    }
    if (errMsg.includes('protected branch') || errMsg.includes('required status')) {
      return { success: false, error: errMsg, errorType: 'protected-branch' };
    }
    if (errMsg.includes('timeout') || errMsg.includes('timed out') || errMsg.includes('ETIMEDOUT')) {
      return { success: false, error: errMsg, errorType: 'timeout' };
    }
    return { success: false, error: errMsg, errorType: 'unknown' };
  }

  async pullRebase(repoPath: string, branch: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['pull', '--rebase', 'origin', branch]);
  }

  async pull(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    return git.raw(['pull']);
  }

  async fetchTags(repoPath: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.raw(['fetch', '--tags']);
  }

  async fetchAll(repoPath: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.raw(['fetch', '--tags', '--all']);
  }

  async checkout(repoPath: string, ref: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.checkout(ref);
  }

  async currentBranch(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    const result = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.trim();
  }

  async remoteExists(repoPath: string, remoteName: string): Promise<boolean> {
    const git = this.getGit(repoPath);
    try {
      const remotes = await git.getRemotes(true);
      return remotes.some((r) => r.name === remoteName);
    } catch {
      return false;
    }
  }

  async setRemote(repoPath: string, remoteName: string, url: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.addRemote(remoteName, url);
  }

  async commitAll(repoPath: string, message: string): Promise<void> {
    const git = this.getGit(repoPath);
    await git.commit(message, undefined, { '--allow-empty': null });
  }

  async add(repoPath: string, files: string[]): Promise<void> {
    const git = this.getGit(repoPath);
    await git.add(files);
  }

  async shaExists(repoPath: string, sha: string): Promise<boolean> {
    const git = this.getGit(repoPath);
    try {
      await git.raw(['cat-file', '-t', sha]);
      return true;
    } catch {
      return false;
    }
  }

  async getConfigEmail(repoPath: string): Promise<string> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['config', 'user.email']);
      return result.trim();
    } catch {
      return 'unknown';
    }
  }

  async showTagDate(repoPath: string, tag: string): Promise<string> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['log', '-1', '--format=%ci', tag]);
      return result.trim();
    } catch {
      return 'unknown';
    }
  }

  async getFileAtRef(repoPath: string, ref: string, filePath: string): Promise<string | null> {
    const git = this.getGit(repoPath);
    try {
      return await git.raw(['show', `${ref}:${filePath}`]);
    } catch {
      return null;
    }
  }

  async lsRemoteTags(repoPath: string, remoteUrl: string): Promise<string[]> {
    const git = this.getGit(repoPath);
    try {
      const result = await git.raw(['ls-remote', '--tags', remoteUrl]);
      const tags: string[] = [];
      for (const line of result.trim().split('\n')) {
        const match = line.match(/refs\/tags\/(v?\d+\.\d+\.\d+)$/);
        if (match) tags.push(match[1]);
      }
      return tags.sort((a, b) => {
        const pa = a.replace(/^v/, '').split('.').map(Number);
        const pb = b.replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (pa[i] !== pb[i]) return pa[i] - pb[i];
        }
        return 0;
      });
    } catch {
      return [];
    }
  }

  async lsRemoteTagsFiltered(repoPath: string, remoteUrl: string, trackPrefix: string): Promise<string[]> {
    const all = await this.lsRemoteTags(repoPath, remoteUrl);
    return all.filter((t) => {
      const stripped = t.replace(/^v/, '');
      const prefix = trackPrefix.replace(/^v/, '');
      return stripped.startsWith(prefix + '.');
    });
  }
}
