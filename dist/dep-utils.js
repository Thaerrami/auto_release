"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEP_SECTIONS = void 0;
exports.extractVersionFromGitSsh = extractVersionFromGitSsh;
exports.extractRepoIdFromGitSsh = extractRepoIdFromGitSsh;
exports.buildGitSshDepValue = buildGitSshDepValue;
exports.isGitSshFormat = isGitSshFormat;
exports.replaceDepValueInRawPackageJson = replaceDepValueInRawPackageJson;
exports.findDepInPackageJson = findDepInPackageJson;
exports.DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'];
function extractVersionFromGitSsh(value) {
    const hashIdx = value.lastIndexOf('#');
    if (hashIdx !== -1) {
        return value.slice(hashIdx + 1).replace(/^v/, '');
    }
    return value.replace(/^[~^]/, '').replace(/^v/, '');
}
function extractRepoIdFromGitSsh(value) {
    const match = value.match(/atypon\/(ui-[\w-]+)\.git/i);
    return match ? match[1] : null;
}
function buildGitSshDepValue(remoteUrl, tag) {
    return `git+ssh://${remoteUrl}#${tag}`;
}
function isGitSshFormat(value) {
    return value.startsWith('git+ssh://') || value.startsWith('git://');
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Replace only the dependency value in raw package.json to preserve indentation and formatting. */
function replaceDepValueInRawPackageJson(raw, key, oldValue, newValue) {
    const escapedKey = escapeRegex(key);
    const escapedOld = escapeRegex(oldValue);
    const pattern = new RegExp(`("${escapedKey}"\\s*:\\s*")${escapedOld}(")`, 'g');
    const replacementValue = newValue.replace(/\$/g, '$$');
    return raw.replace(pattern, `$1${replacementValue}$2`);
}
function findDepInPackageJson(pkgJson, depKey) {
    for (const section of exports.DEP_SECTIONS) {
        const deps = pkgJson[section];
        if (deps && depKey in deps) {
            return { section, value: deps[depKey] };
        }
    }
    return null;
}
//# sourceMappingURL=dep-utils.js.map