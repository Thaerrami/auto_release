## Release Tool (auto_release)

This repo is an **interactive CLI tool** used to perform hotfix releases across the Literatum UI widget repo hierarchy (ui-base → ui-core → themes, plus ui-article), and **upgrade ui-products** dependencies after a successful release.

- **Primary docs**: `docs/README.md`
- **Commands cheat sheet**: `docs/COMMANDS.md`
- **Demo walkthrough**: `docs/DEMO.md`
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

Lists every flag (including product upgrade, `--skip-install-build`, and `--auto-push`) and short examples.

### Common recipes

```bash
# Theme hotfix + auto-upgrade all affected products
node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products

# Release only, skip ui-products step
node dist/index.js --repo ui-core --skip-product-upgrade
```

See **`docs/COMMANDS.md`** for the full command sheet.
