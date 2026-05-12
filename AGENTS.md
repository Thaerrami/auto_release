## Agent runbook (future AI / humans)

This file is meant to make it easy for a future AI agent (or a new engineer) to:
- understand the current state of the tool,
- resume/triage incomplete work safely,
- and produce consistent progress updates.

### What this tool is

- **Repo**: `auto_release`
- **Purpose**: interactive release/hotfix workflow across Literatum UI repos (ui-base → ui-core → themes; plus ui-article).
- **Runtime entrypoint**: `dist/index.js` (built from `src/index.ts`)
- **CLI help**: `node dist/index.js --help` (or `-h`) — full flag list and examples; see `docs/README.md` → *CLI Flags*.

### Where “state” lives

- **Crash recovery state**: `release-logs/run-state.json`
- **Run logs**: `release-logs/release-<timestamp>.log` and `release-logs/release-<timestamp>.json`
- **Lock** (real runs): `/tmp/release-tool-<hostname>.lock` (or `--lock-path`)

### How to get current status quickly

1. Check whether there is an incomplete run:
   - If `release-logs/run-state.json` exists, the next run will prompt **Resume / Fresh / View**.
2. If resuming:
   - Use the tool’s “View completed steps” option to see what already completed.
3. Identify what stopped:
   - Look at the latest `release-logs/release-*.log` and/or `.json`.

### Common failure modes & what to do

- **Cherry-pick conflict**
  - Resolve conflicts in editor
  - `git add <files>`
  - Return to the tool prompt:
    - press **ENTER** to run `git cherry-pick --continue`
    - type **SKIP** to skip that commit
    - type **ABORT** to abort the track

- **“no cherry-pick or revert in progress”**
  - This usually means the cherry-pick was already finished/skipped/aborted.
  - The tool now treats this safely; verify `git log --oneline` contains the SHA if needed.

### Standard progress update format (short)

Use this structure in updates:
- **Now**: what is currently being done (1 sentence)
- **Next**: the next concrete step (1 sentence)
- **Risk** (optional): the one biggest risk / unknown (1 sentence max)

### Prompt template for a future AI agent

Copy/paste this prompt to start work:

"""
You are working in the `auto_release` repo.

Goals:
- Keep the release tool merge-ready and stable.
- If there is an incomplete run, determine whether to resume or discard safely.

What to do first:
- Read `docs/README.md`, `CHANGELOG.md`, `REQUIREMENTS.md`.
- Inspect `release-logs/run-state.json` (if present) and the latest `release-logs/release-*.log/.json`.
- Run `npm run build` and a `--dry-run` smoke check.

Constraints:
- Avoid destructive git actions.
- Prefer small, high-confidence fixes and strong logging.
"""

