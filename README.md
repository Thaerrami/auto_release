## Release Tool (auto_release)

This repo is an **interactive CLI tool** used to perform hotfix releases across the Literatum UI widget repo hierarchy (ui-base → ui-core → themes, plus ui-article).

- **Primary docs**: `docs/README.md`
- **Agent runbook (for future AI work)**: `AGENTS.md`
- **Change history**: `CHANGELOG.md`
- **Requirements / prerequisites**: `REQUIREMENTS.md`

### Quick start

```bash
cd /Users/talazzeh/ui-workspace/auto_release
npm install
npm run build
node dist/index.js
```

### Dry run

```bash
node dist/index.js --repo ui-core --dry-run
```

### CLI help

```bash
node dist/index.js --help
```

Lists every flag (including `--skip-install-build` and `--auto-push`) and short examples.

