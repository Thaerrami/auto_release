"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showDiffSummary = showDiffSummary;
const chalk_1 = __importDefault(require("chalk"));
async function getDepChanges(repo, prevTag, gitClient) {
    const changes = [];
    for (const [depId, pkgKey] of Object.entries(repo.packageJsonDepKeys)) {
        const oldContent = await gitClient.getFileAtRef(repo.localPath, prevTag, 'package.json');
        const newContent = await gitClient.getFileAtRef(repo.localPath, 'HEAD', 'package.json');
        if (!oldContent || !newContent)
            continue;
        try {
            const oldPkg = JSON.parse(oldContent);
            const newPkg = JSON.parse(newContent);
            const depSections = ['dependencies', 'devDependencies', 'peerDependencies'];
            let oldVer = '';
            let newVer = '';
            for (const section of depSections) {
                const oldDeps = oldPkg[section];
                const newDeps = newPkg[section];
                if (oldDeps?.[pkgKey])
                    oldVer = oldDeps[pkgKey];
                if (newDeps?.[pkgKey])
                    newVer = newDeps[pkgKey];
            }
            if (oldVer !== newVer) {
                changes.push({ pkgKey, oldVersion: oldVer || 'none', newVersion: newVer || 'none' });
            }
        }
        catch {
            // parse error
        }
    }
    return changes;
}
function boxLine(content, width) {
    const stripped = content.replace(/\x1B\[[0-9;]*m/g, '');
    const padding = Math.max(0, width - stripped.length - 4);
    return `║  ${content}${' '.repeat(padding)}║`;
}
async function showDiffSummary(repo, prevTag, newTag, gitClient, context, logger) {
    const width = 60;
    const divider = '═'.repeat(width - 2);
    const midDivider = '─'.repeat(width - 4);
    let commits = [];
    let stats = { filesChanged: 0, insertions: 0, deletions: 0 };
    let depChanges = [];
    try {
        commits = await gitClient.log(repo.localPath, prevTag, 'HEAD');
        stats = await gitClient.diffStat(repo.localPath, prevTag, 'HEAD');
        depChanges = await getDepChanges(repo, prevTag, gitClient);
    }
    catch {
        // fallback — tags may not exist yet
    }
    const noColor = context.noColor;
    const g = (s) => noColor ? s : chalk_1.default.green(s);
    const r = (s) => noColor ? s : chalk_1.default.red(s);
    const cy = (s) => noColor ? s : chalk_1.default.cyan(s);
    const b = (s) => noColor ? s : chalk_1.default.bold(s);
    const dim = (s) => noColor ? s : chalk_1.default.dim(s);
    console.log('');
    console.log(cy(`╔${divider}╗`));
    console.log(boxLine(b(`DIFF SUMMARY: ${repo.id}  ${prevTag} → ${newTag}`), width));
    console.log(cy(`╠${'═'.repeat(width - 2)}╣`));
    console.log(boxLine('', width));
    console.log(boxLine(b('Commits included:'), width));
    if (commits.length === 0) {
        console.log(boxLine(dim('  (none)'), width));
    }
    else {
        for (const c of commits.slice(0, 20)) {
            console.log(boxLine(`  [${dim(c.sha)}] ${c.message} (${dim(c.author)})`, width));
        }
        if (commits.length > 20) {
            console.log(boxLine(dim(`  ... and ${commits.length - 20} more`), width));
        }
    }
    console.log(boxLine('', width));
    console.log(boxLine(`Files changed: ${b(String(stats.filesChanged))}  |  ${g(`+${stats.insertions}`)} lines  |  ${r(`-${stats.deletions}`)} lines`, width));
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
    logger.writeTextLine(`DIFF SUMMARY: ${repo.id} ${prevTag} → ${newTag} | ` +
        `${commits.length} commits, ${stats.filesChanged} files, +${stats.insertions}/-${stats.deletions}`);
    const inquirer = await Promise.resolve().then(() => __importStar(require('inquirer')));
    const { action } = await inquirer.default.prompt([{
            type: 'list',
            name: 'action',
            message: 'Choose action:',
            choices: [
                { name: '[P] Push', value: 'push' },
                { name: '[S] Skip repo', value: 'skip' },
                { name: '[A] Abort all', value: 'abort' },
            ],
        }]);
    return action;
}
//# sourceMappingURL=diff-summary.js.map