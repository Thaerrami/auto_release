import os from 'os';
import path from 'path';
import { CLIFlags } from './types';

/** Tool root (auto_release) — logs stay here, never in the repos being released. */
function getToolRoot(): string {
  return path.resolve(__dirname, '..');
}

/** Print full CLI usage (stdout). Exits the process when invoked from parseFlags. */
export function printHelp(): void {
  const lines = [
    '',
    'Release tool — interactive hotfix/release flow across Literatum UI repos',
    '(ui-base → ui-core → themes; plus ui-article).',
    '',
    'Usage:',
    '  node dist/index.js [options]',
    '  npm start -- [options]',
    '',
    'Options:',
    '  -h, --help              Show this help and exit.',
    '',
    '  --dry-run               Preview only: no git writes, lock, or npm install/build.',
    '  --verbose               Verbose command output (git, npm/yarn).',
    '  --no-color              Disable ANSI colors.',
    '',
    '  --repo <id>             Starting repo instead of CWD detection.',
    '                          Examples: ui-base, ui-core, ui-theme-photo, ui-article.',
    '',
    '  --log-dir <path>        Log directory (default: <tool>/release-logs).',
    '  --lock-path <path>      Lock file for non-dry runs (default: /tmp/release-tool-<hostname>.lock).',
    '',
    '  --skip-install-build    Skip npm/yarn install and build for every repo/track',
    '                          (no per-step Yes/Skip prompts).',
    '  --auto-push             After each diff summary, push without the [P]/[S]/[A] menu.',
    '',
    'Examples:',
    '  node dist/index.js --help',
    '  node dist/index.js --repo ui-core --dry-run',
    '  node dist/index.js --skip-install-build --auto-push',
    '  node dist/index.js --repo ui-base --skip-install-build',
    '',
    'Docs: docs/README.md in this repo.',
    '',
  ];
  console.log(lines.join('\n'));
}

export function parseFlags(argv: string[]): CLIFlags {
  const toolRoot = getToolRoot();
  const flags: CLIFlags = {
    dryRun: false,
    verbose: false,
    noColor: false,
    logDir: path.join(toolRoot, 'release-logs'),
    lockPath: `/tmp/release-tool-${os.hostname()}.lock`,
    repoOverride: null,
    skipInstallBuild: false,
    autoPush: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--verbose':
        flags.verbose = true;
        break;
      case '--no-color':
        flags.noColor = true;
        break;
      case '--log-dir': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('Error: --log-dir requires a path argument');
          process.exit(1);
        }
        flags.logDir = path.resolve(next);
        i++;
        break;
      }
      case '--lock-path': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('Error: --lock-path requires a path argument');
          process.exit(1);
        }
        flags.lockPath = path.resolve(next);
        i++;
        break;
      }
      case '--repo': {
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
          console.error('Error: --repo requires a repo ID (e.g. ui-core, ui-base)');
          process.exit(1);
        }
        flags.repoOverride = next;
        i++;
        break;
      }
      case '--skip-install-build':
        flags.skipInstallBuild = true;
        break;
      case '--auto-push':
        flags.autoPush = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        console.error('Run with --help for a full list of options.');
        process.exit(1);
    }
  }

  return flags;
}
