import { GitClient, RepoResult, RunContext } from './types';
import { Logger } from './logger';
/** A repo/tag pair produced by the release run that products may depend on. */
export interface UpgradeTarget {
    repoId: string;
    depKey: string;
    track: string;
    newTag: string;
}
export interface ProductDepChange {
    depKey: string;
    repoId: string;
    oldValue: string;
    newValue: string;
    oldVersion: string;
    newVersion: string;
}
export interface ProductUpgradePlan {
    productId: string;
    packageJsonPath: string;
    changes: ProductDepChange[];
}
export interface ProductUpgradeResult {
    productId: string;
    status: 'success' | 'skipped' | 'failed';
    changes: ProductDepChange[];
    commitSha?: string;
    error?: string;
}
export interface ProductUpgradeSummary {
    plans: ProductUpgradePlan[];
    results: ProductUpgradeResult[];
    stashed: boolean;
}
/** Collect upgrade targets from tags pushed during this release run. */
export declare function collectUpgradeTargets(context: RunContext): UpgradeTarget[];
/** Find all product package.json files (top-level and nested, max depth 2). */
export declare function findProductPackageJsonFiles(rootPath: string): string[];
/** Build upgrade plans for products affected by the release targets. */
export declare function buildProductUpgradePlans(targets: UpgradeTarget[], uiProductsRoot: string): ProductUpgradePlan[];
export declare function isReleaseEligibleForProductUpgrade(results: RepoResult[], context: RunContext): boolean;
/** Main entry: offer and run product dependency upgrades after a successful release. */
export declare function runProductDependencyUpgrades(context: RunContext, results: RepoResult[], gitClient: GitClient, logger: Logger, options: {
    skipProductUpgrade: boolean;
    autoUpgradeProducts: boolean;
    skipProductInstall: boolean;
}): Promise<ProductUpgradeSummary | null>;
//# sourceMappingURL=product-deps.d.ts.map