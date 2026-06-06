## Requirements

### System

- **Node.js**: 18+ (works on Node 20.x)
- **npm**: comes with Node
- **git**: installed and available in `PATH`
- **SSH/GitHub access**: you must be able to `git fetch` / `git push` to the Literatum UI repos

### Workspace layout (expected by `src/config.ts`)

Repos are expected as **siblings** under the same parent folder:

```
ui-workspace/
├── auto_release/     <-- this tool
├── ui-base/
├── ui-core/
├── ui-theme-photo/
├── ui-theme-classic/
├── ui-theme-eureka/
├── ui-theme-nextgen/
├── ui-products/      <-- required for post-release product dep upgrades
└── ui-article/
```

### Safety / operational expectations

- Run **`node dist/index.js --help`** (or **`-h`**) for the full list of CLI flags and examples.
- Run the tool from **inside the repo you want to “stand in”** (recommended), or pass `--repo <id>`.
- For real releases (non-dry-run), the tool uses a **lock file** (default: `/tmp/release-tool-<hostname>.lock`) to avoid concurrent runs.
- Crash recovery state is stored at **`release-logs/run-state.json`** (default log dir: `./release-logs/`).

