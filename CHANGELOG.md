## Changelog

This file tracks **human-readable changes** to the release tool itself (not the product repos it releases).

### 2026-05-12

- **CLI help**: Added `-h` / `--help` — prints full usage, flags, and examples, then exits.
- **Docs**: Documented `--skip-install-build`, `--auto-push`, and help in `docs/README.md` and root `README.md`. Unknown flags now suggest `Run with --help`.

### 2026-04-28

- **Fixed cherry-pick conflict resume**: the tool no longer runs `git cherry-pick --skip` before `--continue`. ENTER now correctly attempts `--continue` after you resolve conflicts and `git add`.
- **Added conflict options**: you can type **`SKIP`** to skip only the conflicting commit, or **`ABORT`** to cancel the track.
- **Hardened abort behavior**: `git cherry-pick --abort` no longer crashes if Git reports “no cherry-pick or revert in progress”.
- **Added entrypoint**: added `src/index.ts` so `npm run build` produces `dist/index.js` (fixes `MODULE_NOT_FOUND: dist/index.js`).
- **Bash parity**: updated `release.sh` conflict loop to match the fixed behavior (continue/skip/abort).

