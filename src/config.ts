import path from 'path';
import { RepoConfig } from './types';

const WORKSPACE = path.resolve(__dirname, '..', '..');
const GH_BASE = 'git@github.com:atypon';

export const UI_PRODUCTS_PATH = path.join(WORKSPACE, 'ui-products');

/** Repos whose tags can be propagated into ui-products package.json dependencies. */
export const PRODUCT_UPGRADEABLE_REPOS: Record<string, { depKey: string }> = {
  'ui-theme-photo': { depKey: 'ui-theme' },
  'ui-theme-classic': { depKey: 'ui-theme' },
  'ui-theme-eureka': { depKey: 'ui-theme' },
  'ui-theme-nextgen': { depKey: 'ui-theme' },
  'ui-core': { depKey: 'ui-core' },
  'ui-article': { depKey: 'ui-article' },
};

/**
 * All repos follow a standardized layout:
 *   - Folder: <workspace>/<id>     (e.g. /Users/.../ui-workspace/ui-core)
 *   - Remote: git@github.com:atypon/<id>.git
 *   - Dep key in package.json: the raw repo id (e.g. "ui-core")
 *   - Dep value format: git+ssh://git@github.com/atypon/<dep>.git#<tag>
 *   - Base branch: develop
 *
 * This factory derives localPath, gitRemoteUrl, baseBranch, and
 * packageJsonDepKeys automatically from the id and deps array.
 */
function repo(
  id: string,
  layer: number,
  deps: string[],
  opts?: {
    versioning?: 'main' | 'independent';
    consumesArticle?: boolean;
    cascadeChildren?: string[];
    excludeFromRelease?: boolean;
  }
): RepoConfig {
  const depKeys: Record<string, string> = {};
  for (const dep of deps) {
    depKeys[dep] = dep;
  }

  return {
    id,
    layer,
    deps,
    localPath: path.join(WORKSPACE, id),
    versioning: opts?.versioning ?? 'main',
    packageJsonDepKeys: depKeys,
    baseBranch: 'develop',
    gitRemoteUrl: `${GH_BASE}/${id}.git`,
    consumesArticle: opts?.consumesArticle ?? false,
    cascadeChildren: opts?.cascadeChildren,
    excludeFromRelease: opts?.excludeFromRelease,
  };
}

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
export const REPOS: RepoConfig[] = [
  repo('ui-base',          1, [],           { cascadeChildren: ['ui-core', 'ui-theme-eureka'] }),
  repo('ui-core',          2, ['ui-base'],   { consumesArticle: true, cascadeChildren: ['ui-theme-photo', 'ui-theme-classic'] }),
  repo('ui-theme-photo',   3, ['ui-core'], { consumesArticle: true }),
  repo('ui-theme-classic', 3, ['ui-core'], { consumesArticle: true }),
  repo('ui-theme-nextgen', 3, ['ui-core'], { consumesArticle: true }),
  repo('ui-products',      3, ['ui-core'], { excludeFromRelease: true }),
  repo('ui-theme-eureka',  2, ['ui-base'], { consumesArticle: true }),
  repo('ui-article',       0, [],           { versioning: 'independent' }),
];

export const ARTICLE_REMOTE_URL = `${GH_BASE}/ui-article.git`;

export function getRepoById(id: string): RepoConfig | undefined {
  return REPOS.find((r) => r.id === id);
}

export function getReposByLayer(): Map<number, RepoConfig[]> {
  const layers = new Map<number, RepoConfig[]>();
  for (const repo of REPOS) {
    const list = layers.get(repo.layer) ?? [];
    list.push(repo);
    layers.set(repo.layer, list);
  }
  return layers;
}

export function sortReposByDependencyOrder(repos: RepoConfig[]): RepoConfig[] {
  const layerOrder = [1, 2, 3, 0];
  return [...repos].sort((a, b) => {
    const aIdx = layerOrder.indexOf(a.layer);
    const bIdx = layerOrder.indexOf(b.layer);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Detect which repo the CWD sits inside.
 * Compares resolved CWD against each repo's localPath, with a
 * directory-name fallback (e.g. CWD /x/ui-core matches "ui-core").
 */
export function detectStandingRepo(cwd: string): RepoConfig | null {
  const resolved = path.resolve(cwd);

  for (const r of REPOS) {
    if (resolved === path.resolve(r.localPath)) return r;
  }

  const dirName = path.basename(resolved);
  for (const r of REPOS) {
    if (dirName === r.id) return r;
  }

  return null;
}

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
export function getRepoAndDescendants(startRepo: RepoConfig): RepoConfig[] {
  const result = new Set<string>();
  const queue = [startRepo.id];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (result.has(currentId)) continue;
    const current = getRepoById(currentId);
    if (!current || current.excludeFromRelease) continue;
    result.add(currentId);

    const children = current?.cascadeChildren
      ? current.cascadeChildren
      : REPOS
          .filter((r) => r.deps.includes(currentId) && !r.excludeFromRelease)
          .map((r) => r.id);

    for (const childId of children) {
      const child = getRepoById(childId);
      if (child && !child.excludeFromRelease && !result.has(childId)) {
        queue.push(childId);
      }
    }
  }

  const repos = Array.from(result)
    .map((id) => getRepoById(id))
    .filter((r): r is RepoConfig => r !== undefined);

  return sortReposByDependencyOrder(repos);
}
