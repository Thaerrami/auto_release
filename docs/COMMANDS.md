# Commands & Quick Reference

One-page cheat sheet for the Release Tool. For full explanations see [README.md](README.md).

## Setup (once)

```bash
cd auto_release
npm install
npm run build
```

## Most common commands

| Goal | Command |
|------|---------|
| Show all flags | `node dist/index.js --help` |
| Dry run from ui-core | `node dist/index.js --repo ui-core --dry-run` |
| Hotfix from standing repo | `cd ../ui-theme-photo && node ../auto_release/dist/index.js` |
| Hotfix with explicit repo | `node dist/index.js --repo ui-theme-photo` |
| Faster run (skip install/build + auto push) | `node dist/index.js --repo ui-core --skip-install-build --auto-push` |
| Full hotfix + auto-upgrade products | `node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products` |
| Hotfix without product upgrades | `node dist/index.js --repo ui-core --skip-product-upgrade` |
| Shell dry run | `bash release.sh --repo ui-core --dry-run` |

## Standing repo → release tree

| You stand in (`--repo` or CWD) | Repos processed |
|--------------------------------|-----------------|
| `ui-base` | ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic |
| `ui-core` | ui-core, ui-theme-photo, ui-theme-classic |
| `ui-theme-photo` | ui-theme-photo only |
| `ui-theme-classic` | ui-theme-classic only |
| `ui-theme-eureka` | ui-theme-eureka only |
| `ui-article` | ui-article only |

## All CLI flags

| Flag | Description |
|------|-------------|
| `-h`, `--help` | Print usage and exit |
| `--dry-run` | Preview only; no git writes, lock, or npm |
| `--verbose` | Full git/npm output |
| `--no-color` | Disable ANSI colors |
| `--repo <id>` | Starting repo instead of CWD detection |
| `--log-dir <path>` | Log directory (default: `./release-logs/`) |
| `--lock-path <path>` | Lock file (default: `/tmp/release-tool-<hostname>.lock`) |
| `--skip-install-build` | Skip npm/yarn install and build everywhere (no prompts) |
| `--auto-push` | Push after each diff summary without [P]/[S]/[A] menu |
| `--skip-product-upgrade` | Skip post-release ui-products dependency upgrades |
| `--auto-upgrade-products` | Upgrade all affected products without selection prompt |
| `--skip-product-install` | Skip `npm install` when upgrading product deps |

## Recipe: theme hotfix end-to-end

Example: cherry-pick a fix into `ui-theme-photo` track `v2.6`, tag, push, then bump products.

```bash
cd /path/to/ui-workspace/ui-theme-photo
node ../auto_release/dist/index.js
# 1. Select track v2.6
# 2. Enter cherry-pick SHA(s)
# 3. Choose ui-article upgrade (N/S/P) if prompted
# 4. Confirm install/build and push at each diff summary
# 5. After release completes → product upgrade menu:
#    [A] Upgrade all  |  [S] Select products  |  [N] Skip
# 6. ui-products: stash → develop → pull → bump package.json → commit
# 7. Optionally push ui-products to origin/develop
```

**Non-interactive product step:**

```bash
node ../auto_release/dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products
```

**Preview only (release + products):**

```bash
node ../auto_release/dist/index.js --repo ui-theme-photo --dry-run
```

## Recipe: core hotfix with cascade

```bash
cd /path/to/ui-workspace/ui-core
node ../auto_release/dist/index.js --skip-install-build --auto-push
# Processes: ui-core → ui-theme-photo → ui-theme-classic
# Products on matching ui-core / ui-theme tracks are offered at the end
```

## Interactive prompts cheat sheet

### Run-wide (once per run)

| Prompt | Options | Meaning |
|--------|---------|---------|
| Version tracks | checkbox | Tracks used for **all** repos (e.g. `v2.6`, `v2.8`) |
| Cherry-pick SHAs | text / empty | Commits applied to every repo/track |
| ui-article upgrade | N / S / P | Leave as-is / single version / per-track version |

### Per repo

| Prompt | Options | Meaning |
|--------|---------|---------|
| Dirty tree | S / P / A | Stash / proceed / abort this repo |
| npm install | Y / S | Run install or skip |
| npm build | Y / S | Run build or skip |
| Diff summary | P / S / A | Push tag / skip repo / abort all |

### Cherry-pick conflict

| Input | Action |
|-------|--------|
| **ENTER** | `git cherry-pick --continue` |
| **SKIP** | Skip this commit |
| **ABORT** | Abort current track |

### Post-release: ui-products upgrade

| Prompt | Options | Meaning |
|--------|---------|---------|
| Product upgrade | A / S / N | Upgrade all / select individually / skip |
| ui-products dirty tree | S / A | Stash and continue / abort |
| npm install per product | Y / N | Update lockfiles in each product |
| Push ui-products | Y / N | Push commits to `origin/develop` |

## Product matching rules

After a successful release, the tool finds **ui-products** (including nested products like `sage/mal`) whose `package.json` pins:

| Released repo | Product dep key | Match rule |
|---------------|-----------------|------------|
| `ui-theme-photo` | `ui-theme` | URL contains `ui-theme-photo`, same track (e.g. `v2.6.x`) |
| `ui-theme-classic` | `ui-theme` | URL contains `ui-theme-classic`, same track |
| `ui-theme-eureka` | `ui-theme` | URL contains `ui-theme-eureka`, same track |
| `ui-theme-nextgen` | `ui-theme` | URL contains `ui-theme-nextgen`, same track |
| `ui-core` | `ui-core` | Same track (e.g. `v2.8.x`) |
| `ui-article` | `ui-article` | When released or chosen during theme upgrade |

Example: hotfix `ui-theme-photo` → `v2.6.73` upgrades `cabi`, `sup`, `asha`, etc. that pin `#v2.6.*` on `ui-theme-photo`.

## Logs & recovery

| File | Purpose |
|------|---------|
| `release-logs/release-*.log` | Human-readable run log |
| `release-logs/release-*.json` | Structured results (tags, deps, status) |
| `release-logs/run-state.json` | Crash recovery (Resume / Fresh / View) |

## npm scripts (in auto_release)

| Script | Command |
|--------|---------|
| Build | `npm run build` |
| Run tool | `npm start -- [flags]` |
| Help | `npm run help` |
| Generate slides | `npm run ppt` |
