export declare const DEP_SECTIONS: readonly ["dependencies", "devDependencies", "peerDependencies"];
export declare function extractVersionFromGitSsh(value: string): string;
export declare function extractRepoIdFromGitSsh(value: string): string | null;
export declare function buildGitSshDepValue(remoteUrl: string, tag: string): string;
export declare function isGitSshFormat(value: string): boolean;
/** Replace only the dependency value in raw package.json to preserve indentation and formatting. */
export declare function replaceDepValueInRawPackageJson(raw: string, key: string, oldValue: string, newValue: string): string;
export declare function findDepInPackageJson(pkgJson: Record<string, unknown>, depKey: string): {
    section: typeof DEP_SECTIONS[number];
    value: string;
} | null;
//# sourceMappingURL=dep-utils.d.ts.map