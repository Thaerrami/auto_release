import { TagInfo } from './types';
export declare function getTrackFromVersion(version: string): string | null;
export declare function parseTag(tag: string): TagInfo | null;
export declare function groupTagsByTrack(tags: string[]): Map<string, TagInfo[]>;
export declare function getLatestInTrack(trackInfos: TagInfo[]): TagInfo | null;
export declare function computeNextTag(track: string, existing: TagInfo[]): string;
export declare function tagToVersion(tag: string): string;
export declare function versionToTag(version: string): string;
export declare function compareVersions(a: string, b: string): number;
export declare function isVersionAhead(current: string, proposed: string): boolean;
//# sourceMappingURL=version.d.ts.map