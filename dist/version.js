"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackFromVersion = getTrackFromVersion;
exports.parseTag = parseTag;
exports.groupTagsByTrack = groupTagsByTrack;
exports.getLatestInTrack = getLatestInTrack;
exports.computeNextTag = computeNextTag;
exports.tagToVersion = tagToVersion;
exports.versionToTag = versionToTag;
exports.compareVersions = compareVersions;
exports.isVersionAhead = isVersionAhead;
function getTrackFromVersion(version) {
    const normalized = version.startsWith('v') ? version : `v${version}`;
    const match = normalized.match(/^v(\d+)\.(\d+)/);
    if (!match)
        return null;
    return `v${match[1]}.${match[2]}`;
}
function parseTag(tag) {
    const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
    if (!match)
        return null;
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    return {
        tag,
        major,
        minor,
        patch,
        track: `v${major}.${minor}`,
    };
}
function groupTagsByTrack(tags) {
    const tracks = new Map();
    for (const tag of tags) {
        const parsed = parseTag(tag);
        if (!parsed)
            continue;
        const list = tracks.get(parsed.track) ?? [];
        list.push(parsed);
        tracks.set(parsed.track, list);
    }
    for (const [track, infos] of tracks) {
        infos.sort((a, b) => a.patch - b.patch);
        tracks.set(track, infos);
    }
    return tracks;
}
function getLatestInTrack(trackInfos) {
    if (trackInfos.length === 0)
        return null;
    return trackInfos[trackInfos.length - 1];
}
function computeNextTag(track, existing) {
    const latest = getLatestInTrack(existing);
    if (!latest) {
        return `${track}.0`;
    }
    return `${track}.${latest.patch + 1}`;
}
function tagToVersion(tag) {
    return tag.startsWith('v') ? tag.slice(1) : tag;
}
function versionToTag(version) {
    return version.startsWith('v') ? version : `v${version}`;
}
function compareVersions(a, b) {
    const pa = parseTag(a.startsWith('v') ? a : `v${a}`);
    const pb = parseTag(b.startsWith('v') ? b : `v${b}`);
    if (!pa || !pb)
        return 0;
    if (pa.major !== pb.major)
        return pa.major - pb.major;
    if (pa.minor !== pb.minor)
        return pa.minor - pb.minor;
    return pa.patch - pb.patch;
}
function isVersionAhead(current, proposed) {
    return compareVersions(current, proposed) > 0;
}
//# sourceMappingURL=version.js.map