"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFlags = parseFlags;
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
function parseFlags(argv) {
    const flags = {
        dryRun: false,
        verbose: false,
        noColor: false,
        logDir: path_1.default.resolve(process.cwd(), 'release-logs'),
        lockPath: `/tmp/release-tool-${os_1.default.hostname()}.lock`,
        repoOverride: null,
    };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
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
            default:
                console.error(`Unknown flag: ${arg}`);
                console.error('Usage: release-tool [--dry-run] [--verbose] [--no-color] ' +
                    '[--log-dir <path>] [--lock-path <path>] [--repo <id>]');
                process.exit(1);
        }
    }
    return flags;
}
//# sourceMappingURL=cli.js.map