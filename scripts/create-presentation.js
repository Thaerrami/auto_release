#!/usr/bin/env node
/**
 * Generates Release-Tool.pptx in the project root.
 * Run: node scripts/create-presentation.js
 */
const pptxgen = require('pptxgenjs');
const path = require('path');

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';

const FONT_CODE = 'Courier New';
const COLOR_CMD = '1a5276';
const COLOR_RESULT = '1e8449';
const COLOR_WARN = 'b7950b';

function addTitleSlide(title, subtitle) {
  const slide = pres.addSlide();
  slide.addText(title, {
    x: 0.5, y: 1.5, w: 9, h: 1.2, fontSize: 44, bold: true, align: 'center',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 2.8, w: 9, h: 0.6, fontSize: 18, align: 'center', color: '363636',
    });
  }
  return slide;
}

function addSectionSlide(title, body, opts = {}) {
  const slide = pres.addSlide();
  slide.addText(title, { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
  slide.addText(body, {
    x: 0.5, y: 1, w: 9, h: opts.h ?? 5.5, fontSize: opts.fontSize ?? 13, valign: 'top',
  });
  return slide;
}

function addExampleSlide(title, command, steps, expected) {
  const slide = pres.addSlide();
  slide.addText(title, { x: 0.5, y: 0.25, w: 9, h: 0.5, fontSize: 24, bold: true });

  slide.addText('Command', { x: 0.5, y: 0.85, w: 9, h: 0.3, fontSize: 12, bold: true, color: COLOR_CMD });
  slide.addText(command, {
    x: 0.5, y: 1.15, w: 9, h: 0.55, fontSize: 11, fontFace: FONT_CODE, color: COLOR_CMD,
    fill: { color: 'f4f6f7' },
  });

  if (steps) {
    slide.addText('What you do', { x: 0.5, y: 1.85, w: 4.2, h: 0.3, fontSize: 12, bold: true });
    slide.addText(steps, {
      x: 0.5, y: 2.15, w: 4.2, h: 2.8, fontSize: 10, valign: 'top',
    });
  }

  slide.addText('Expected result', {
    x: steps ? 5 : 0.5, y: steps ? 1.85 : 1.85, w: steps ? 4.3 : 9, h: 0.3,
    fontSize: 12, bold: true, color: COLOR_RESULT,
  });
  slide.addText(expected, {
    x: steps ? 5 : 0.5, y: steps ? 2.15 : 2.15, w: steps ? 4.3 : 9, h: 3.2,
    fontSize: 10, valign: 'top', color: '1a1a1a',
    fill: { color: 'eafaf1' },
  });
  return slide;
}

function addFlagExampleSlide(rows) {
  const slide = pres.addSlide();
  slide.addText('Flags: usage & expected results', { x: 0.5, y: 0.25, w: 9, h: 0.5, fontSize: 24, bold: true });
  slide.addTable(
    [['Flag / Command', 'When to use', 'Expected result'], ...rows],
    {
      x: 0.4, y: 0.9, w: 9.2, colW: [2.4, 2.8, 4.0], fontSize: 9,
      border: { pt: 0.5, type: 'solid', color: 'cccccc' },
      align: 'left', valign: 'top',
    }
  );
  return slide;
}

// ── Slide 1: Title ──
addTitleSlide(
  'Release Tool',
  'Git release management across the Literatum UI widget hierarchy'
);

// ── Slide 2: What it does ──
addSectionSlide(
  'What it does',
  '• Auto-detects repo from CWD (or --repo <id>) and resolves dependency tree\n' +
  '• Per version track (e.g. v2.7): sync → cherry-pick → bump deps → build → tag → push\n' +
  '• After release: scans ui-products and upgrades matching theme/core/article deps\n' +
  '• Run once: choose tracks + cherry-pick SHAs at start; apply to all repos\n' +
  '• Logs to release-logs/ (.log + .json); crash recovery and file lock\n\n' +
  'Node (recommended):  node dist/index.js\n' +
  'Shell:               bash release.sh --repo <id>'
);

// ── Slide 3: Repo tree ──
const slide3 = pres.addSlide();
slide3.addText('Repo dependency tree', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slide3.addText(
  'ui-base (layer 1)\n' +
  '├── ui-core (layer 2)\n' +
  '│   ├── ui-theme-photo (layer 3)\n' +
  '│   ├── ui-theme-classic (layer 3)\n' +
  '│   └── ui-theme-nextgen (layer 3)\n' +
  '└── ui-theme-eureka (layer 2)\n\n' +
  'ui-products (no tags — upgraded after release)\n' +
  'ui-article (independent versioning)',
  { x: 0.5, y: 1, w: 4.8, h: 4, fontSize: 12, fontFace: FONT_CODE, valign: 'top' }
);
slide3.addText(
  'You stand in → Tool processes\n\n' +
  'ui-base          → base, core, eureka, photo, classic\n' +
  'ui-core          → core, photo, classic\n' +
  'ui-theme-photo   → photo only\n' +
  'ui-theme-classic → classic only\n' +
  'ui-article       → article only',
  { x: 5.5, y: 1, w: 4, h: 3.5, fontSize: 11, valign: 'top' }
);

// ── Slide 4: Per-repo flow ──
addSectionSlide(
  'Per-repo release flow',
  '1. Checkout & sync — develop, pull, fetch tags\n' +
  '2. Dirty tree — [S] Stash  [P] Proceed  [A] Abort\n' +
  '3. Track selection — pick v2.6, v2.8, etc. (once for all repos)\n' +
  '4. Per track: compute next tag (e.g. v2.6.72 → v2.6.73), checkout latest tag\n' +
  '5. Cherry-pick SHAs (shared across repos/tracks)\n' +
  '6. Bump parent dep in package.json (ui-core, ui-base, ui-article)\n' +
  '7. npm install / npm run build — [Y] Yes  [S] Skip (unless --skip-install-build)\n' +
  '8. Diff summary — [P] Push  [S] Skip repo  [A] Abort (unless --auto-push)\n' +
  '9. Tag and push to origin; return to develop\n' +
  '10. Post-release: ui-products dependency upgrade (unless --skip-product-upgrade)'
);

// ── Example 1: Dry run ──
addExampleSlide(
  'Example 1 — Dry run (safe preview)',
  'node dist/index.js --repo ui-theme-photo --dry-run',
  '1. Select track v2.6\n2. Enter cherry-pick SHA (or empty)\n3. ui-article: choose N\n4. At diff summary: choose P',
  '• Banner: "DRY-RUN MODE — no writes"\n' +
  '• All git/npm shown as [DRY-RUN] Would run: ...\n' +
  '• No lock file, no tags pushed, no commits\n' +
  '• Shows next tag (e.g. v2.6.73)\n' +
  '• Lists affected products at end:\n' +
  '    cabi — ui-theme: v2.6.72 → v2.6.73\n' +
  '    sup, asha, aami, …\n' +
  '• JSON log written with status "success" / dryRun: true'
);

// ── Example 2: Theme hotfix (interactive) ──
addExampleSlide(
  'Example 2 — Theme hotfix (interactive)',
  'cd ui-theme-photo && node ../auto_release/dist/index.js',
  '1. Track: v2.6\n2. SHA: abc1234 (fix commit)\n3. ui-article: N\n4. Install/build: Y\n5. Diff summary: P\n6. Products: A (upgrade all)\n7. Push ui-products: Y',
  'Widget repo:\n' +
  '• New tag v2.6.73 pushed to origin\n' +
  '• package.json ui-core bumped if core was released\n\n' +
  'ui-products:\n' +
  '• cabi, sup, asha, aami, avl, apharma updated\n' +
  '• ui-theme → git+ssh://.../ui-theme-photo.git#v2.6.73\n' +
  '• One commit per product on develop\n' +
  '• Pushed to origin/develop\n\n' +
  'Log: release-logs/release-*.json tagsCreated: ["v2.6.73"]'
);

// ── Example 3: Core cascade ──
addExampleSlide(
  'Example 3 — Core hotfix with cascade',
  'node dist/index.js --repo ui-core',
  '1. Track: v2.8\n2. Enter fix SHA\n3. Confirm push for ui-core, then photo, then classic\n4. At end: select products on v2.8 track',
  'Processes 3 repos in order:\n' +
  '• ui-core      → tag v2.8.50 (example)\n' +
  '• ui-theme-photo  → bumps ui-core dep, tag v2.8.50\n' +
  '• ui-theme-classic → bumps ui-core dep, tag v2.8.50\n\n' +
  'Products offered if they pin:\n' +
  '• ui-core#v2.8.x (acm, acropolis, …)\n' +
  '• ui-theme-photo#v2.8.x or ui-theme-classic#v2.8.x\n' +
  '• Nested: acropolis/pericles, sage/mal'
);

// ── Example 4: Fast automation flags ──
addExampleSlide(
  'Example 4 — Faster run (automation flags)',
  'node dist/index.js --repo ui-core --skip-install-build --auto-push',
  'No install/build prompts.\nNo [P]/[S]/[A] at diff summary.\nYou still answer: tracks, SHAs, ui-article, product menu.',
  '• Skips npm install and npm run build in every repo\n' +
  '• Pushes tag immediately after each diff summary\n' +
  '• Saves time when build was verified locally\n' +
  '• Lock acquired; real tags pushed to origin\n' +
  '• Product upgrade step still runs at end\n\n' +
  'Use when: hotfix is small, CI will validate build later'
);

// ── Example 5: Full product automation ──
addExampleSlide(
  'Example 5 — Release + auto-upgrade all products',
  'node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products --skip-product-install',
  'Tracks + SHAs only.\nNo push menu, no product selection, no npm install in products.',
  '• ui-theme-photo tag pushed (e.g. v2.6.73)\n' +
  '• ALL matching products upgraded automatically\n' +
  '• package.json updated; lockfiles NOT refreshed\n' +
  '• Commits on ui-products/develop\n' +
  '• Prompt: "Push ui-products to origin/develop?"\n\n' +
  'Fastest path for theme-only hotfix.\n' +
  'Run npm install in products separately if needed.'
);

// ── Example 6: Skip products ──
addExampleSlide(
  'Example 6 — Widget release only (skip products)',
  'node dist/index.js --repo ui-core --skip-product-upgrade',
  'Normal interactive release.\nProduct step never appears.',
  '• Widget repos released as usual\n' +
  '• No ui-products scan or menu\n' +
  '• Use when: products updated separately, or not ready yet\n\n' +
  'Combine with --auto-push for widget-only automation:\n' +
  'node dist/index.js --repo ui-core --auto-push --skip-product-upgrade'
);

// ── Flags table part 1 ──
addFlagExampleSlide([
  [
    '--dry-run',
    'First-time try; training; verify product list',
    'No git writes, no lock, no npm. Shows [DRY-RUN] lines and affected products.',
  ],
  [
    '--repo ui-theme-photo',
    'Run from any directory',
    'Same as cd ui-theme-photo && node ... — processes photo only.',
  ],
  [
    '--verbose',
    'Debug git/npm failures',
    'Full command output on screen and in .log file.',
  ],
  [
    '--skip-install-build',
    'Hotfix already built locally',
    'No install/build prompts. Tags still pushed if you confirm/auto-push.',
  ],
  [
    '--auto-push',
    'Trust diff summary; skip push menu',
    'Tag pushed right after summary. Does NOT skip install/build.',
  ],
]);

// ── Flags table part 2 ──
addFlagExampleSlide([
  [
    '--skip-product-upgrade',
    'Widget-only release',
    'Run ends after widget repos. ui-products untouched.',
  ],
  [
    '--auto-upgrade-products',
    'Many products; no manual selection',
    'All matched products bumped + committed. Still asks push ui-products.',
  ],
  [
    '--skip-product-install',
    'Speed; update lockfiles later',
    'package.json updated only. Run npm install in products separately.',
  ],
  [
    '--log-dir ./my-logs',
    'Custom log location',
    'release-*.log and release-*.json written to chosen folder.',
  ],
  [
    '-h / --help',
    'Quick reference',
    'Prints all flags and exits. No prompts.',
  ],
]);

// ── Expected JSON output ──
addSectionSlide(
  'Expected JSON log (release-logs/release-*.json)',
  '{\n' +
  '  "runId": "hostname-12345",\n' +
  '  "engineer": "you@atypon.com",\n' +
  '  "dryRun": false,\n' +
  '  "repos": [\n' +
  '    {\n' +
  '      "repoId": "ui-theme-photo",\n' +
  '      "tracksProcessed": ["v2.6"],\n' +
  '      "tagsCreated": ["v2.6.73"],\n' +
  '      "depsBumped": { "ui-core": "2.8.50" },\n' +
  '      "status": "success",\n' +
  '      "stashed": false\n' +
  '    }\n' +
  '  ]\n' +
  '}\n\n' +
  'Use for auditing: which tags were created, which deps bumped, errors per repo.',
  { fontSize: 11, h: 5.2 }
);

// ── Product upgrade detail ──
addExampleSlide(
  'Product matching — before & after',
  'Hotfix: ui-theme-photo track v2.6 → new tag v2.6.73',
  'Match rule:\n' +
  '• dep key: ui-theme\n' +
  '• URL contains ui-theme-photo\n' +
  '• current version on track v2.6.x\n' +
  '(includes v2.6.68.1)',
  'Before                          After\n' +
  'cabi  #v2.6.72  →  #v2.6.73\n' +
  'sup   #v2.6.71  →  #v2.6.73\n' +
  'siam  (classic) →  NOT affected\n\n' +
  'Nested products also scanned:\n' +
  'sage/mal, marlin/lancet, wk/nt, …\n\n' +
  'ui-products: stash → develop → pull → commit → optional push'
);

// ── Common recipes table ──
const slideRecipes = pres.addSlide();
slideRecipes.addText('Common recipes — copy & paste', { x: 0.5, y: 0.25, w: 9, h: 0.5, fontSize: 24, bold: true });
slideRecipes.addTable(
  [
    ['Goal', 'Command'],
    ['Preview everything', 'node dist/index.js --repo ui-theme-photo --dry-run'],
    ['Theme hotfix (interactive)', 'cd ui-theme-photo && node ../auto_release/dist/index.js'],
    ['Fast widget release', 'node dist/index.js --repo ui-core --skip-install-build --auto-push'],
    ['Hotfix + all products', 'node dist/index.js --repo ui-theme-photo --auto-push --auto-upgrade-products'],
    ['Widgets only', 'node dist/index.js --repo ui-core --skip-product-upgrade'],
    ['Show all flags', 'node dist/index.js --help'],
  ],
  {
    x: 0.4, y: 0.85, w: 9.2, colW: [2.5, 6.7], fontSize: 10, fontFace: FONT_CODE,
    border: { pt: 0.5, type: 'solid', color: 'cccccc' },
    align: 'left', valign: 'middle',
  }
);

// ── Logging & recovery ──
addSectionSlide(
  'Logging, recovery & troubleshooting',
  'Each run writes to release-logs/:\n' +
  '• release-YYYYMMDD-HHMMSS.log — prompts, git output, errors\n' +
  '• release-YYYYMMDD-HHMMSS.json — tags, deps, status per repo\n\n' +
  'Crash mid-run → run-state.json → next start offers [R] Resume [F] Fresh [V] View\n\n' +
  'Cherry-pick conflict → resolve in editor → git add → ENTER to continue\n' +
  '                     → SKIP to skip commit  → ABORT to cancel track\n\n' +
  'Lock held by another engineer → [W] Wait  [F] Force  [A] Abort'
);

// ── Summary ──
const slideSummary = pres.addSlide();
slideSummary.addText('Summary', { x: 0.5, y: 0.3, w: 9, h: 0.6, fontSize: 28, bold: true });
slideSummary.addText(
  '• One tool: widget release + ui-products dependency upgrades\n' +
  '• Start from standing repo; tool cascades downward\n' +
  '• --dry-run first to see tags and affected products\n' +
  '• --auto-push + --auto-upgrade-products for fastest hotfix path\n' +
  '• --skip-product-upgrade when products handled separately',
  { x: 0.5, y: 1, w: 9, h: 2.5, fontSize: 15, valign: 'top' }
);
slideSummary.addText('docs/README.md  ·  docs/COMMANDS.md  ·  docs/DEMO.md', {
  x: 0.5, y: 4.2, w: 9, h: 0.5, fontSize: 14, align: 'center', color: '666666',
});

const outPath = path.join(__dirname, '..', 'Release-Tool.pptx');
pres.writeFile({ fileName: outPath })
  .then(() => console.log('Created:', outPath))
  .catch((err) => {
    console.error('Error writing PowerPoint:', err);
    process.exit(1);
  });
