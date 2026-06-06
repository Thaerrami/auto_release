# Release Tool — Demo & Walkthrough

This guide walks through a **dry-run** demo so you can see the full flow without changing any repos.

## 1. Prerequisites

- `auto_release` built: `npm install && npm run build`
- At least one UI repo (e.g. `ui-core`) cloned as a sibling of `auto_release` under the same workspace parent

Example layout:

```
ui-workspace/
├── auto_release/   ← you are here
├── ui-core/
├── ui-theme-photo/
└── ...
```

## 2. CLI help (optional)

To see every flag without starting a run:

```bash
cd /path/to/ui-workspace/auto_release
node dist/index.js --help
```

## 3. Run a dry run

From the workspace, run the Node tool with `--dry-run` and `--repo` so it doesn’t rely on your current directory:

```bash
cd /path/to/ui-workspace/auto_release
node dist/index.js --repo ui-core --dry-run
```

Or from inside a repo:

```bash
cd /path/to/ui-workspace/ui-core
node ../auto_release/dist/index.js --dry-run
```

You should see the banner and **DRY-RUN MODE**; no git or file writes will happen.

## 4. What you’ll see (step by step)

### Startup

- **Banner**: “Release Management Tool” and dry-run notice.
- **Standing repo**: e.g. `Standing repo: ui-core`.
- **Release tree**: list of repos that will be processed (e.g. `ui-core` → `ui-theme-photo`, `ui-theme-classic`).
- **Path checks**: each repo’s path is validated; missing paths cause exit.

### Run-wide prompts (once per run)

1. **Version tracks**  
   You’re asked to pick one or more tracks (e.g. `v2.7`, `v2.8`). The tool lists existing tags per track. You can also add a new track (e.g. `v2.9`).  
   *Demo tip:* choose one or two existing tracks.

2. **Cherry-pick SHAs**  
   Optional. Space-separated commit SHAs to cherry-pick into every repo/track. Empty = no cherry-picks.  
   *Demo tip:* leave empty or use a valid SHA from `ui-core` if you want to see that step.

3. **ui-article upgrade**  
   For repos that depend on `ui-article`, you can choose:  
   - **N** — leave as-is  
   - **S** — single version for all tracks  
   - **P** — per-track version  
   *Demo tip:* choose **N** to keep the demo short.

### Per-repo, per-track flow

For each repo (in dependency order), then each track:

- **Processing: &lt;repo&gt;** header.
- **Track: &lt;track&gt;** (e.g. `v2.7`).
- **Next tag** — e.g. “New tag: **v2.7.96**” (computed from latest in track).
- **Dry-run lines** for:
  - `git checkout develop` / `git pull` / `git fetch --tags`
  - `git checkout <tag>`
  - Cherry-pick (if SHAs were given).
  - Bump parent dep in `package.json`.
  - `npm install` / `npm run build` (if you don’t skip).
  - `git tag` / `git push origin <tag>`
  - `git tag -d <tag>`
  - `git checkout develop`
- **Diff summary** — commits and file stats that would be included in the release.
- **Choice: [P]ush / [S]kip / [A]bort** — in dry run, choosing **P** only logs; no real push.

At the end you get a **FINAL SUMMARY** of what would have been done (and in the Node tool, a **DRY-RUN SUMMARY** with tags that would be created).

## 5. Example: minimal demo session

```text
$ node dist/index.js --repo ui-core --dry-run

  ╔══════════════════════════════════════════╗
  ║        Release Management Tool           ║
  ╚══════════════════════════════════════════╝

  ⚠  DRY-RUN MODE — no writes will be executed

  Standing repo: ui-core
  Release tree (3 repos):

  → ui-core (depends on: ui-base)
    ui-theme-classic (depends on: ui-core)
    ui-theme-photo (depends on: ui-core)

  Validating repo paths...
    ✓ ui-core: /path/to/ui-core
    ✓ ui-theme-classic: /path/to/ui-theme-classic
    ✓ ui-theme-photo: /path/to/ui-theme-photo

  Select version tracks (used for all repos in this run):
  Available tracks:
    v2.7 — latest: v2.7.95
    v2.8 — latest: v2.8.31
  ? Select version tracks: v2.7

  Enter commit SHAs to cherry-pick (space-separated, or empty to skip): [Enter]

  Upgrade ui-article in consuming repos?
  ? Choice [N/S/P]: N

  ═══════════════════════════════════════════════════════════
    Processing: ui-core
  ═══════════════════════════════════════════════════════════
  Using tracks for all repos: v2.7
  ── Track: v2.7 ──
  [DRY-RUN] Would run: git checkout develop
  [DRY-RUN] Would run: git pull
  ...
  New tag: v2.7.96
  [DRY-RUN] Would run: git checkout v2.7.95
  ...
  DIFF SUMMARY: ui-core v2.7.95 → v2.7.96 | 0 commits, 0 files
  [P] Push  [S] Skip  [A] Abort  → P
  [DRY-RUN] Would run: git tag v2.7.96
  [DRY-RUN] Would run: git push origin v2.7.96
  ...

  (same for ui-theme-classic, ui-theme-photo)

  ✓  Release run complete.
  Logs: release-logs/release-....log
  JSON: release-logs/release-....json

  Upgraded versions from this release:
    ui-theme-photo track v2.7 → v2.7.96

  6 product(s) affected in ui-products:
    cabi — ui-theme (ui-theme-photo): v2.7.95 → v2.7.96
    ...

  ? Product dependency upgrade: [A] Upgrade all  [S] Select  [N] Skip

  ╔══════════════════════════════════════════╗
  ║        DRY-RUN SUMMARY                   ║
  ╚══════════════════════════════════════════╝
  ui-core:
    Tracks: v2.7
    Tags that would be created: v2.7.96
  ...
```

## 6. Shell script demo

Same idea with the bash script:

```bash
cd /path/to/ui-workspace/auto_release
bash release.sh --repo ui-core --dry-run
```

You’ll get the same prompts (tracks, SHAs, ui-article). All git/npm writes are replaced with “Would run: …” lines. Log is written to `release-logs/release-YYYYMMDD-HHMMSS.log` even in dry run.

## 7. Logs and JSON output (real run)

When you run **without** `--dry-run`, the Node tool writes:

- **release-logs/release-YYYYMMDD-HHMMSS.log** — chronological log (timestamps, INFO/WARN/ERROR).
- **release-logs/release-YYYYMMDD-HHMMSS.json** — structured result, e.g.:

```json
{
  "runId": "31bb5f2f-e9df-4f80-9d0c-8cf1ae5d7f16",
  "startedAt": "2026-03-10T10:51:45.852Z",
  "finishedAt": "2026-03-10T10:55:45.314Z",
  "engineer": "you@example.com",
  "dryRun": false,
  "repos": [
    {
      "repoId": "ui-core",
      "tracksProcessed": ["v2.7", "v2.8"],
      "tagsCreated": ["v2.7.95", "v2.8.31"],
      "cherryPicks": ["c06bd34..."],
      "depsBumped": { "ui-base": "2.8.42" },
      "errors": [],
      "status": "success",
      "stashed": false
    }
  ]
}
```

Use this for auditing or scripting.

## 8. Post-release: ui-products upgrade

After a **successful** release (not skipped with `--skip-product-upgrade`), the tool scans **ui-products** for dependencies that match the tags you just pushed.

### What you’ll see

1. **Upgraded versions** — list of repos and tags from this run (e.g. `ui-theme-photo track v2.6 → v2.6.73`).
2. **Affected products** — each product path and dep change (e.g. `cabi — ui-theme: v2.6.72 → v2.6.73`).
3. **Menu:** `[A] Upgrade all` · `[S] Select products` · `[N] Skip`
4. If upgrading: **ui-products** is stashed (if dirty), checked out to `develop`, pulled.
5. Per product: `package.json` updated, optional `npm install`, commit.
6. **Push ui-products?** — confirm before pushing to `origin/develop`.

In **dry run**, all of the above is shown as `[DRY-RUN]` — no files or commits.

### Demo tips

- Use `--dry-run` to see which products would be affected without changing anything.
- Use `--skip-product-upgrade` to end the run after widget repos only.
- Use `--auto-upgrade-products` in real runs to skip the product selection menu.

```bash
node dist/index.js --repo ui-theme-photo --dry-run
# Complete release prompts, then review the product list at the end

node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products --skip-product-install
# Full automation: release + upgrade all matching products (no npm install)
```

## 9. Quick reference

| Goal | Command |
|------|---------|
| **Command sheet (all recipes)** | See **[COMMANDS.md](COMMANDS.md)** |
| List all CLI flags | `node dist/index.js --help` |
| Demo from any directory | `node dist/index.js --repo ui-core --dry-run` |
| Demo from repo dir | `cd ../ui-core && node ../auto_release/dist/index.js --dry-run` |
| Shell dry run | `bash release.sh --repo ui-core --dry-run` |
| Real run (Node) | `node dist/index.js --repo ui-core` |
| Real run + auto products | `node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products` |
| Real run, skip products | `node dist/index.js --repo ui-core --skip-product-upgrade` |
| Real run (shell) | `cd ../ui-core && bash ../auto_release/release.sh` |

For full options and flow details, see [README.md](README.md).
