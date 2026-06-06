import { RepoConfig } from './types';
export declare const UI_PRODUCTS_PATH: string;
/** Repos whose tags can be propagated into ui-products package.json dependencies. */
export declare const PRODUCT_UPGRADEABLE_REPOS: Record<string, {
    depKey: string;
}>;
/**
 * Dependency tree:
 *
 *   ui-base (layer 1)
 *   ├── ui-core (layer 2) — hotfix on core cascades to photo + classic only
 *   │   ├── ui-theme-photo (layer 3)
 *   │   ├── ui-theme-classic (layer 3)
 *   │   ├── ui-theme-nextgen (layer 3)
 *   │   └── ui-products (layer 3) — no tags, excluded from release
 *   └── ui-theme-eureka (layer 2)
 *
 *   ui-article (layer 0, independent versioning)
 *
 * Hotfix flow: when change is in ui-core, process ui-core only, then upgrade
 * ui-theme-photo and ui-theme-classic (not ui-base, ui-theme-eureka, ui-products, ui-theme-nextgen).
 */
export declare const REPOS: RepoConfig[];
export declare const ARTICLE_REMOTE_URL = "git@github.com:atypon/ui-article.git";
export declare function getRepoById(id: string): RepoConfig | undefined;
export declare function getReposByLayer(): Map<number, RepoConfig[]>;
export declare function sortReposByDependencyOrder(repos: RepoConfig[]): RepoConfig[];
/**
 * Detect which repo the CWD sits inside.
 * Compares resolved CWD against each repo's localPath, with a
 * directory-name fallback (e.g. CWD /x/ui-core matches "ui-core").
 */
export declare function detectStandingRepo(cwd: string): RepoConfig | null;
/**
 * BFS from a starting repo, collecting it and descendants to upgrade.
 * Uses cascadeChildren when set (e.g. ui-core → only [ui-theme-photo, ui-theme-classic]).
 * Excludes repos with excludeFromRelease (e.g. ui-products has no tags).
 *
 * Examples:
 *   ui-base  → [ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic]
 *   ui-core  → [ui-core, ui-theme-photo, ui-theme-classic]  (not ui-products, ui-theme-nextgen)
 *   ui-theme-photo → [ui-theme-photo]
 *   ui-article     → [ui-article]
 */
export declare function getRepoAndDescendants(startRepo: RepoConfig): RepoConfig[];
//# sourceMappingURL=config.d.ts.map