# TODO

Project assessment as of 2026-07-23 (v2.0.0). Health: 56/56 tests pass, ESLint
and Prettier clean, all four bundles build (ESM / CJS / global / types), the
ASP.NET Core example compiles with zero warnings. The items below are ordered
by priority within each section.

## Release & distribution

- [ ] Publish the package to npm — the README promises `npm install free-block-engine`, but the name returns 404 on the registry (it is still free, claim it).
- [ ] Create a `v2.0.0` git tag and a GitHub Release with the changelog excerpt.
- [ ] Deploy a live demo (GitHub Pages job in CI: `npm run build` + `example.html` + `dist/`) and link it from the README.
- [ ] Add `homepage` and `bugs` fields to `package.json`.

## Bugs

- [x] `duplicateBlock()` assigns `copy.data` **after** `createBlock()` records the history snapshot (`src/blockEngine.js`). Undo → redo of a duplicate silently loses the custom `data`. Fixed: the copy is recorded as a batch of create + `setBlockData`.
- [x] Nested batches are broken: `History.beginBatch()` ignores an inner begin, but the first `endBatch()` closes the outer batch prematurely (`src/history.js`). Fixed: batches track nesting depth.
- [x] `historyLimit` is not propagated: `updateSettings({ historyLimit })` and snapshot import update `settings` but the existing `History` instance keeps its old limit (`src/blockEngine.js`). Fixed via `History.setLimit()`.
- [x] Undo/redo of link operations emits only the internal `linksChanged` event (`_applyPairState`), so subscribers of `blocksLinked` / `blocksUnlinked` never hear about replayed changes. Fixed: `linksChanged` is now part of the documented API (README + `docs/api.md`).

## API & developer experience

- [x] Type the event system: a JSDoc event-name → payload map so the generated `.d.ts` gives typed `on`/`off`/`emit` instead of `(data: unknown) => void`. Done: `EngineEventMap` typedef, generic `on`/`off`/`emit`.
- [x] Offer built-in optional keyboard shortcuts in the renderer (Ctrl+Z/Y, Delete, Ctrl+A, Ctrl+D, arrow-key nudge). Done: `keyboardShortcuts` renderer option; the demo uses it.
- [x] Document `arrangeBlocks()` in the README API section and `docs/api.md`. Done.
- [x] Custom block content hook (render markdown/HTML per block type). Done: `renderContent(block, element, { readOnly })` renderer option.
- [x] Autosave helper: a small localStorage adapter with debounce. Done: `Autosave` / `createAutosave()` export with injectable storage.

## Features

- [ ] Light theme preset and `prefers-color-scheme` support — `src/styles.js` currently ships a dark-only palette (themeable via `--fbe-*`, but no ready light set).
- [ ] Z-order management: bring a block to front on select/drag, persist an explicit `zIndex`.
- [ ] Snap guides / alignment hints while dragging (edges and centers of neighbouring blocks).
- [ ] Edge routing options: straight / orthogonal, plus basic obstacle avoidance.
- [ ] Context menu (right-click, long-press on touch) for block and canvas actions.
- [ ] Auto-layout algorithms beyond the grid `arrangeBlocks`: tree / layered / force-directed.
- [ ] Export the board to PNG/SVG.
- [ ] Block grouping / collapsible containers (long-term).

## Performance (matters beyond ~500 blocks)

- [ ] Viewport culling: skip rendering blocks far outside the visible camera rect.
- [ ] Minimap rebuilds every block `div` on each update (`src/minimap.js`) — reuse nodes or draw to a `<canvas>`.
- [ ] `_buildChips()` calls `getIncomingLinks()` (a full scan) per block, making import O(n²); maintain a reverse-link index in the engine.
- [ ] Add a benchmark page (1k+ blocks) and document practical limits.

## Accessibility

- [ ] ARIA roles/labels for blocks, action buttons and the link editor popup; focus trap inside the popup; visible focus outlines.
- [ ] Keyboard-only operation: focus/select blocks, open editors and create links without a mouse.

## Quality & CI

- [ ] Test coverage report (`vitest --coverage`) with a threshold in CI and a badge.
- [ ] CI matrix for Node 18 / 20 / 22 (currently only Node 20).
- [ ] Integration test for the ASP.NET example (`WebApplicationFactory`: GET/POST `/api/board`, anti-forgery rejection, oversized payload).
- [ ] Bundle-size guard (e.g. `size-limit`): `free-block-engine.global.min.js` is 58 KB today; fail CI on unexpected growth.
- [ ] Enable Dependabot (npm + NuGet + Actions) and CodeQL scanning.
