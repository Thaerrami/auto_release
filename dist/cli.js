"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printHelp = printHelp;
exports.parseFlags = parseFlags;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
/** Tool root (auto_release) — logs stay here, never in the repos being released. */
function getToolRoot() {
    return path_1.default.resolve(__dirname, '..');
}
/** Print full CLI usage (stdout). Exits the process when invoked from parseFlags. */
function printHelp() {
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
        '  --skip-product-upgrade  Skip post-release ui-products dependency upgrades.',
        '  --auto-upgrade-products Upgrade all affected products without selection prompt.',
        '  --skip-product-install  Skip npm install when upgrading product dependencies.',
        '',
        'Examples:',
        '  node dist/index.js --help',
        '  node dist/index.js --repo ui-core --dry-run',
        '  node dist/index.js --skip-install-build --auto-push',
        '  node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products',
        '  node dist/index.js --repo ui-core --skip-product-upgrade',
        '',
        'Docs: docs/README.md · docs/COMMANDS.md',
        '',
    ];
    console.log(lines.join('\n'));
}
function parseFlags(argv) {
    const toolRoot = getToolRoot();
    const flags = {
        dryRun: false,
        verbose: false,
        noColor: false,
        logDir: path_1.default.join(toolRoot, 'release-logs'),
        lockPath: `/tmp/release-tool-${os_1.default.hostname()}.lock`,
        repoOverride: null,
        skipInstallBuild: false,
        autoPush: false,
        skipProductUpgrade: false,
        autoUpgradeProducts: false,
        skipProductInstall: false,
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
                flags.logDir = path_1.default.resolve(next);
                i++;
                break;
            }
            case '--lock-path': {
                const next = argv[i + 1];
                if (!next || next.startsWith('--')) {
                    console.error('Error: --lock-path requires a path argument');
                    process.exit(1);
                }
                flags.lockPath = path_1.default.resolve(next);
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
            case '--skip-product-upgrade':
                flags.skipProductUpgrade = true;
                break;
            case '--auto-upgrade-products':
                flags.autoUpgradeProducts = true;
                break;
            case '--skip-product-install':
                flags.skipProductInstall = true;
                break;
            default:
                console.error(`Unknown flag: ${arg}`);
                console.error('Run with --help for a full list of options.');
                process.exit(1);
        }
    }
    return flags;
}
//# sourceMappingURL=cli.js.map