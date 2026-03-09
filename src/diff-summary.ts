import chalk from 'chalk';
import { RepoConfig, GitClient, RunContext, CommitInfo, DiffStats } from './types';
import { Logger } from './logger';

interface DepChange {
  pkgKey: string;
  oldVersion: string;
  newVersion: string;
}

async function getDepChanges(
  repo: RepoConfig,
  prevTag: string,
  gitClient: GitClient
): Promise<DepChange[]> {
  const changes: DepChange[] = [];

  for (const [depId, pkgKey] of Object.entries(repo.packageJsonDepKeys)) {
    const oldContent = await gitClient.getFileAtRef(repo.localPath, prevTag, 'package.json');
    const newContent = await gitClient.getFileAtRef(repo.localPath, 'HEAD', 'package.json');

    if (!oldContent || !newContent) continue;

    try {
      const oldPkg = JSON.parse(oldContent) as Record<string, unknown>;
      const newPkg = JSON.parse(newContent) as Record<string, unknown>;

      const depSections = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
      let oldVer = '';
      let newVer = '';

      for (const section of depSections) {
        const oldDeps = oldPkg[section] as Record<string, string> | undefined;
        const newDeps = newPkg[section] as Record<string, string> | undefined;
        if (oldDeps?.[pkgKey]) oldVer = oldDeps[pkgKey];
        if (newDeps?.[pkgKey]) newVer = newDeps[pkgKey];
      }

      if (oldVer !== newVer) {
        changes.push({ pkgKey, oldVersion: oldVer || 'none', newVersion: newVer || 'none' });
      }
    } catch {
      // parse error
    }
  }

  return changes;
}

function boxLine(content: string, width: number): string {
  const stripped = content.replace(/\x1B\[[0-9;]*m/g, '');
  const padding = Math.max(0, width - stripped.length - 4);
  return `║  ${content}${' '.repeat(padding)}║`;
}

export async function showDiffSummary(
  repo: RepoConfig,
  prevTag: string,
  newTag: string,
  gitClient: GitClient,
  context: RunContext,
  logger: Logger
): Promise<'push' | 'skip' | 'abort'> {
  const width = 60;
  const divider = '═'.repeat(width - 2);
  const midDivider = '─'.repeat(width - 4);

  let commits: CommitInfo[] = [];
  let stats: DiffStats = { filesChanged: 0, insertions: 0, deletions: 0 };
  let depChanges: DepChange[] = [];

  try {
    commits = await gitClient.log(repo.localPath, prevTag, 'HEAD');
    stats = await gitClient.diffStat(repo.localPath, prevTag, 'HEAD');
    depChanges = await getDepChanges(repo, prevTag, gitClient);
  } catch {
    // fallback — tags may not exist yet
  }

  const noColor = context.noColor;
  const g = (s: string) => noColor ? s : chalk.green(s);
  const r = (s: string) => noColor ? s : chalk.red(s);
  const cy = (s: string) => noColor ? s : chalk.cyan(s);
  const b = (s: string) => noColor ? s : chalk.bold(s);
  const dim = (s: string) => noColor ? s : chalk.dim(s);

  console.log('');
  console.log(cy(`╔${divider}╗`));
  console.log(boxLine(b(`DIFF SUMMARY: ${repo.id}  ${prevTag} → ${newTag}`), width));
  console.log(cy(`╠${'═'.repeat(width - 2)}╣`));

  console.log(boxLine('', width));
  console.log(boxLine(b('Commits included:'), width));
  if (commits.length === 0) {
    console.log(boxLine(dim('  (none)'), width));
  } else {
    for (const c of commits.slice(0, 20)) {
      console.log(boxLine(`  [${dim(c.sha)}] ${c.message} (${dim(c.author)})`, width));
    }
    if (commits.length > 20) {
      console.log(boxLine(dim(`  ... and ${commits.length - 20} more`), width));
    }
  }

  console.log(boxLine('', width));
  console.log(
    boxLine(
      `Files changed: ${b(String(stats.filesChanged))}  |  ${g(`+${stats.insertions}`)} lines  |  ${r(`-${stats.deletions}`)} lines`,
      width
    )
  );

  if (depChanges.length > 0) {
    console.log(boxLine('', width));
    console.log(boxLine(b('package.json dep changes:'), width));
    for (const dc of depChanges) {
      console.log(boxLine(`  ${dc.pkgKey}:  ${r(dc.oldVersion)}  →  ${g(dc.newVersion)}`, width));
    }
  }

  console.log(boxLine('', width));
  console.log(boxLine(`Tag to create: ${g(newTag)}  (will push to origin)`, width));
  console.log(cy(`╠${'═'.repeat(width - 2)}╣`));
  console.log(boxLine(`[P] Push    [S] Skip repo    [A] Abort all`, width));
  console.log(cy(`╚${divider}╝`));
  console.log('');

  logger.writeTextLine(
    `DIFF SUMMARY: ${repo.id} ${prevTag} → ${newTag} | ` +
    `${commits.length} commits, ${stats.filesChanged} files, +${stats.insertions}/-${stats.deletions}`
  );

  const inquirer = await import('inquirer');
  const { action } = await inquirer.default.prompt<{ action: string }>([{
    type: 'list',
    name: 'action',
    message: 'Choose action:',
    choices: [
      { name: '[P] Push', value: 'push' },
      { name: '[S] Skip repo', value: 'skip' },
      { name: '[A] Abort all', value: 'abort' },
    ],
  }]);

  return action as 'push' | 'skip' | 'abort';
}
