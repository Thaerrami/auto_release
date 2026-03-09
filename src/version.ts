import { TagInfo } from './types';

export function parseTag(tag: string): TagInfo | null {
  const match = tag.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
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

export function groupTagsByTrack(tags: string[]): Map<string, TagInfo[]> {
  const tracks = new Map<string, TagInfo[]>();
  for (const tag of tags) {
    const parsed = parseTag(tag);
    if (!parsed) continue;
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

export function getLatestInTrack(trackInfos: TagInfo[]): TagInfo | null {
  if (trackInfos.length === 0) return null;
  return trackInfos[trackInfos.length - 1];
}

export function computeNextTag(track: string, existing: TagInfo[]): string {
  const latest = getLatestInTrack(existing);
  if (!latest) {
    return `${track}.0`;
  }
  return `${track}.${latest.patch + 1}`;
}

export function tagToVersion(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

export function versionToTag(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = parseTag(a.startsWith('v') ? a : `v${a}`);
  const pb = parseTag(b.startsWith('v') ? b : `v${b}`);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}

export function isVersionAhead(current: string, proposed: string): boolean {
  return compareVersions(current, proposed) > 0;
}
