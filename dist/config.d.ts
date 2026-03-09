import { RepoConfig } from './types';
/**
 * Dependency tree:
 *
 *   ui-base (layer 1)
 *   ├── ui-core (layer 2)
 *   │   ├── ui-theme-photo (layer 3)
 *   │   ├── ui-theme-classic (layer 3)
 *   │   ├── ui-theme-nextgen (layer 3)
 *   │   └── ui-products (layer 3)
 *   └── ui-theme-eureka (layer 2)
 *
 *   ui-article (layer 0, independent versioning)
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
 * BFS from a starting repo, collecting it and all descendants
 * (repos that depend on it, directly or transitively), in dependency order.
 *
 * Examples:
 *   ui-base  → [ui-base, ui-core, ui-theme-eureka, ui-products, ui-theme-classic, ui-theme-nextgen, ui-theme-photo]
 *   ui-core  → [ui-core, ui-products, ui-theme-classic, ui-theme-nextgen, ui-theme-photo]
 *   ui-theme-photo → [ui-theme-photo]
 *   ui-article     → [ui-article]
 */
export declare function getRepoAndDescendants(startRepo: RepoConfig): RepoConfig[];
//# sourceMappingURL=config.d.ts.map