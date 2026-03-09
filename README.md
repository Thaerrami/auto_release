# Release Tool

Interactive CLI tool for managing Git releases across the Literatum UI widget repo hierarchy. Replaces the old `codeUpdate.sh`, `upgradeArticle.sh`, and `UpgradeTheme2.sh` shell scripts.

## Prerequisites

- Node.js 18+
- All repos cloned as siblings in the same parent directory:

```
ui-workspace/
├── auto_release/     <-- this tool
├── ui-base/
├── ui-core/
├── ui-theme-photo/
├── ui-theme-classic/
├── ui-theme-eureka/
└── ui-article/
```

## Install & Build

```bash
cd auto_release
npm install
npm run build
```

## Usage

### Run from inside a repo (recommended)

`cd` into the repo you want to release from. The tool auto-detects where you are and resolves the full dependency tree downward:

```bash
cd ../ui-core
node /path/to/auto_release/dist/index.js
```

| You stand in | Tool processes |
|---|---|
| `ui-base` | ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic |
| `ui-core` | ui-core, ui-theme-photo, ui-theme-classic |
| `ui-theme-photo` | ui-theme-photo |
| `ui-theme-eureka` | ui-theme-eureka |
| `ui-article` | ui-article |

### Run with `--repo` flag

From any directory, specify the starting repo explicitly:

```bash
node dist/index.js --repo ui-base
```

### Dry run (preview only)

See what would happen without writing anything:

```bash
node dist/index.js --repo ui-core --dry-run
```

## CLI Flags

| Flag | Description |
|---|---|
| `--dry-run` | Preview mode. All reads execute, all writes are skipped and printed as `[DRY-RUN]`. |
| `--verbose` | Print full raw git and npm command output. |
| `--no-color` | Disable ANSI colors (useful for piping output or CI). |
| `--repo <id>` | Override CWD auto-detection. Must be one of: `ui-base`, `ui-core`, `ui-theme-photo`, `ui-theme-classic`, `ui-theme-eureka`, `ui-article`. |
| `--log-dir <path>` | Custom log output directory. Default: `./release-logs/`. |
| `--lock-path <path>` | Custom lock file path. Default: `/tmp/release-tool-<hostname>.lock`. |

## Repo Dependency Tree

```
ui-base (layer 1)
├── ui-core (layer 2)
│   ├── ui-theme-photo (layer 3)
│   └── ui-theme-classic (layer 3)
└── ui-theme-eureka (layer 2)

ui-article (layer 0, independent versioning)
```

All `main`-versioned repos share the same `major.minor` track (e.g. `v2.7`). Only the patch number increments per release. `ui-article` has its own independent version namespace.

## Per-Repo Release Flow

For each repo in dependency order, the tool runs these steps:

1. **Checkout & sync** -- `git checkout develop`, `git pull`, `git fetch --tags`
2. **Dirty tree check** -- If uncommitted changes exist, offers to stash, proceed, or abort
3. **Track selection** -- Lists all `major.minor` tracks with their latest tag. Select one or more tracks, or enter a new track manually
4. **Per-track processing** (for each selected track):
   - **Compute next tag** -- Finds latest patch in the track, increments by 1
   - **Checkout tag** -- Checks out the latest tag for the track (detached HEAD)
   - **Bump parent dep** -- If a parent repo was released in this run (or has a remote tag on this track), updates `package.json` with the exact new version
   - **Cherry-pick** -- Prompts for commit SHAs to cherry-pick. Validates each SHA exists. Pauses on conflicts for manual resolution
   - **npm install** -- Runs install. On failure, enters a retry loop (no skip allowed)
   - **npm run build** -- Runs build. On failure, offers retry, skip, or abort
   - **Diff summary** -- Shows a boxed summary of commits, file stats, dep changes, and the tag to create. Requires explicit `[P]ush` confirmation
   - **Push** -- Creates tag, pushes to origin. Handles non-fast-forward, auth errors, protected branches, and timeouts with retries
   - **Return to develop** -- Checks out the base branch before the next track

## Release Scenarios

| Scenario | Example |
|---|---|
| **Head repo only** | Run from `ui-base`. Cherry-pick, build, tag, push on selected tracks. |
| **Head + children** | Run from `ui-base`. After ui-base completes, ui-core gets the dep bump automatically, then themes get theirs. |
| **Children only** | Run from `ui-theme-photo`. Bumps dep to the latest existing parent tag (via `ls-remote`), cherry-picks, builds, tags. |
| **ui-article** | Run from `ui-article`. Independent versioning, same flow. After completion, ui-article version cascades into consuming repos. |
| **Multi-track** | Select `v2.7` and `v2.8` for the same repo. Each track is processed sequentially. One track failing does not block others. |

## Logging

Each run produces two files in `release-logs/`:

- **`release-YYYYMMDD-HHMMSS.log`** -- Full human-readable log of all prompts, responses, git output, and errors.
- **`release-YYYYMMDD-HHMMSS.json`** -- Structured JSON with run metadata, per-repo results, tags created, dep bumps, and errors.

## Crash Recovery

If the tool crashes mid-run, it writes a `run-state.json` file to the log directory. On the next startup, it detects the incomplete run and offers:

- **Resume** -- Continue from the last completed step
- **Fresh** -- Discard the previous state and start over
- **View** -- Print what was completed before the crash

## Concurrency Lock

In non-dry-run mode, the tool acquires a file lock (`proper-lockfile`) to prevent two engineers from running releases simultaneously. If the lock is already held, you'll see who holds it and since when, with options to wait, force-override (for crash recovery), or abort.

## Project Structure

```
src/
├── index.ts          Entry point and main orchestrator
├── types.ts          All TypeScript interfaces
├── config.ts         Repo graph, tree detection, dependency resolution
├── cli.ts            CLI flag parsing
├── messages.ts       All user-facing strings
├── logger.ts         Dual-output logger (.log + .json)
├── git-client.ts     Git operations (interface + implementation via simple-git)
├── lock.ts           Concurrency lock (proper-lockfile)
├── run-state.ts      Crash recovery state management
├── version.ts        Tag parsing, track grouping, version math
├── dep-bump.ts       Parent dependency bumping in package.json
├── cherry-pick.ts    Cherry-pick execution with conflict handling
├── build.ts          npm install / build with retry loops
├── diff-summary.ts   Pre-push diff display
├── push.ts           Push with error classification and retries
├── repo-flow.ts      Per-repo release flow (all steps per track)
└── startup.ts        Path validation, repo resolution, crash recovery UI
```
