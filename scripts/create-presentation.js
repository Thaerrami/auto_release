#!/usr/bin/env node
/**
 * Generates Release-Tool.pptx in the project root.
 * Run: node scripts/create-presentation.js
 */
const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();

// Title slide
const titleSlide = pres.addSlide();
titleSlide.addText('Release Tool', {
  x: 0.5,
  y: 1.5,
  w: 9,
  h: 1.2,
  fontSize: 44,
  bold: true,
  align: 'center',
});
titleSlide.addText('Git release management across the Literatum UI widget hierarchy', {
  x: 0.5,
  y: 2.8,
  w: 9,
  h: 0.6,
  fontSize: 18,
  align: 'center',
  color: '363636',
});

// What it does
const slide2 = pres.addSlide();
slide2.addText('What it does', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide2.addText(
  '• Auto-detects repo from CWD (or --repo <id>) and resolves dependency tree\n' +
    '• Per version track (e.g. v2.7, v2.8): sync, checkout tag, cherry-pick, bump deps, build, tag, push\n' +
    '• Run once: choose tracks + cherry-pick SHAs at start; apply to all repos\n' +
    '• Logs to release-logs/ (.log + .json); crash recovery and file lock',
  { x: 0.5, y: 1, w: 9, h: 2.2, fontSize: 14, valign: 'top' }
);
slide2.addText('Two interfaces', { x: 0.5, y: 3.5, w: 9, h: 0.4, fontSize: 18, bold: true });
slide2.addText('Node (recommended): node dist/index.js — interactive, crash recovery, lock, JSON logs', {
  x: 0.5,
  y: 4,
  w: 9,
  h: 0.35,
  fontSize: 12,
});
slide2.addText('Shell: release.sh — same workflow in bash; use from repo dir or --repo <id>', {
  x: 0.5,
  y: 4.4,
  w: 9,
  h: 0.35,
  fontSize: 12,
});

// Repo tree
const slide3 = pres.addSlide();
slide3.addText('Repo dependency tree', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide3.addText(
  'ui-base (layer 1)\n' +
    '├── ui-core (layer 2)\n' +
    '│   ├── ui-theme-photo (layer 3)\n' +
    '│   ├── ui-theme-classic (layer 3)\n' +
    '│   └── ui-theme-nextgen (layer 3)\n' +
    '└── ui-theme-eureka (layer 2)\n\n' +
    'ui-article (layer 0, independent)',
  { x: 0.5, y: 1, w: 5, h: 3.5, fontSize: 14, fontFace: 'Consolas', valign: 'top' }
);
slide3.addText(
  'You stand in → Tool processes\n\n' +
    'ui-base → ui-base, ui-core, ui-theme-eureka, ui-theme-photo, ui-theme-classic\n\n' +
    'ui-core → ui-core, ui-theme-photo, ui-theme-classic\n\n' +
    'ui-theme-photo → ui-theme-photo only',
  { x: 5.5, y: 1, w: 4, h: 3, fontSize: 11, valign: 'top' }
);

// Per-repo flow
const slide4 = pres.addSlide();
slide4.addText('Per-repo release flow', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
const steps = [
  '1. Checkout & sync — develop, pull, fetch tags',
  '2. Dirty tree check — stash / proceed / abort',
  '3. Track selection — pick v2.7, v2.8, etc.',
  '4. Per track: compute next tag, checkout tag',
  '5. Cherry-pick SHAs (shared across repos/tracks)',
  '6. Bump parent dep in package.json',
  '7. npm install / npm run build (optional, retry/skip)',
  '8. Diff summary → [P]ush / [S]kip / [A]bort',
  '9. Tag and push to origin',
];
slide4.addText(steps.join('\n'), {
  x: 0.5,
  y: 1,
  w: 9,
  h: 5,
  fontSize: 13,
  valign: 'top',
});

// Usage
const slide5 = pres.addSlide();
slide5.addText('Usage', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide5.addText('From inside a repo (recommended)', {
  x: 0.5,
  y: 1,
  w: 9,
  h: 0.35,
  fontSize: 14,
  bold: true,
});
slide5.addText('cd ../ui-core && node /path/to/auto_release/dist/index.js', {
  x: 0.5,
  y: 1.4,
  w: 9,
  h: 0.4,
  fontSize: 12,
  fontFace: 'Consolas',
});
slide5.addText('Dry run (preview only)', { x: 0.5, y: 2.1, w: 9, h: 0.35, fontSize: 14, bold: true });
slide5.addText('node dist/index.js --repo ui-core --dry-run', {
  x: 0.5,
  y: 2.5,
  w: 9,
  h: 0.4,
  fontSize: 12,
  fontFace: 'Consolas',
});
slide5.addText('Shell script', { x: 0.5, y: 3.1, w: 9, h: 0.35, fontSize: 14, bold: true });
slide5.addText('bash release.sh --repo ui-base --dry-run', {
  x: 0.5,
  y: 3.5,
  w: 9,
  h: 0.4,
  fontSize: 12,
  fontFace: 'Consolas',
});

// CLI flags table
const slide6 = pres.addSlide();
slide6.addText('CLI flags (Node)', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide6.addTable(
  [
    ['Flag', 'Description'],
    ['--dry-run', 'Preview only; no writes'],
    ['--verbose', 'Full git/npm output'],
    ['--no-color', 'Disable ANSI colors'],
    ['--repo <id>', 'Starting repo (ui-base, ui-core, …)'],
    ['--log-dir <path>', 'Log directory'],
    ['--lock-path <path>', 'Lock file path'],
  ],
  {
    x: 0.5,
    y: 1,
    w: 9,
    colW: [1.8, 7.2],
    fontSize: 12,
    border: { pt: 0.5, type: 'solid', color: 'cccccc' },
    align: 'left',
    valign: 'middle',
  }
);

// Logging & recovery
const slide7 = pres.addSlide();
slide7.addText('Logging & recovery', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide7.addText(
  'Each run writes to release-logs/:\n\n' +
    '• release-YYYYMMDD-HHMMSS.log — full log (prompts, git, errors)\n' +
    '• release-YYYYMMDD-HHMMSS.json — structured result (tags, deps, status)\n\n' +
    'Crash recovery: run-state.json lets you Resume / Fresh / View on next start.\n\n' +
    'Concurrency: file lock prevents two engineers releasing at once.',
  { x: 0.5, y: 1, w: 9, h: 3.5, fontSize: 14, valign: 'top' }
);

// Demo
const slide8 = pres.addSlide();
slide8.addText('Demo', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide8.addText(
  'Try without changing any repo:\n\n' +
    'node dist/index.js --repo ui-core --dry-run\n\n' +
    'You’ll be prompted for tracks and cherry-pick SHAs; all writes are skipped.\n\n' +
    'See DEMO.md for step-by-step walkthrough.',
  { x: 0.5, y: 1, w: 9, h: 2.5, fontSize: 14, valign: 'top' }
);

// Summary
const slide9 = pres.addSlide();
slide9.addText('Summary', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide9.addText(
  '• One tool for the full Literatum UI release workflow (replaces codeUpdate.sh, upgradeArticle.sh, UpgradeTheme2.sh)\n' +
    '• Node + Shell; dependency-aware; run-wide tracks and cherry-picks\n' +
    '• Dry run, logs, crash recovery, lock — safe and auditable',
  { x: 0.5, y: 1, w: 9, h: 2, fontSize: 16, valign: 'top' }
);
slide9.addText('README.md · DEMO.md', {
  x: 0.5,
  y: 4.5,
  w: 9,
  h: 0.5,
  fontSize: 14,
  align: 'center',
  color: '666666',
});

const outPath = path.join(__dirname, '..', 'Release-Tool.pptx');
pres.writeFile({ fileName: outPath })
  .then(() => console.log('Created:', outPath))
  .catch((err) => {
    console.error('Error writing PowerPoint:', err);
    process.exit(1);
  });
