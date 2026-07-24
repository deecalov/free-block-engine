# TODO

Last reviewed 2026-07-25. Health: 138 JS tests and 14 .NET tests pass, ESLint
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

- [x] ~~Light theme preset~~ **Dark** theme preset and `prefers-color-scheme` support. The original note was wrong: the shipped palette is light, so the missing preset was the dark one. Done: `theme: 'light' | 'dark' | 'auto'` plus ~20 hard-coded colours extracted into `--fbe-*` variables.
- [x] Z-order management: bring a block to front on select/drag, persist an explicit `zIndex`. Done: `bringToFront()` (outside history) and undoable `setBlockZIndex()`, applied through a `--fbe-z` custom property so `.dragging` still wins.
- [x] Snap guides / alignment hints while dragging (edges and centers of neighbouring blocks). Done: `snapGuides` option; snapped positions bypass grid rounding.
- [ ] Edge routing options: straight / orthogonal, plus basic obstacle avoidance.
- [x] Context menu (right-click, long-press on touch) for block and canvas actions. Done: `contextMenu` option with a `contextMenuItems` hook, keyboard navigation and ARIA roles.
- [ ] Auto-layout algorithms beyond the grid `arrangeBlocks`: tree / layered / force-directed.
- [x] Export the board to PNG/SVG. Done: `exportToSVG()` / `exportToPNG()` on the renderer and as standalone functions.
- [ ] Block grouping / collapsible containers (long-term).

## Performance (matters beyond ~500 blocks)

- [x] Viewport culling: skip rendering blocks far outside the visible camera rect. Done: opt-in `cullOffscreen`; drag at 3000 blocks goes from 8 to 21 fps.
- [x] Minimap rebuilds every block `div` on each update (`src/minimap.js`). Done: the nodes are pooled and reused.
- [x] `_buildChips()` calls `getIncomingLinks()` (a full scan) per block, making import O(n²). Done: the engine keeps a reverse link index.
- [x] Add a benchmark page (1k+ blocks) and document practical limits. Done: `benchmarks/stress.html`, figures in `docs/architecture.md`.
- [ ] Cull connections as well — the SVG layer still draws every edge and is now the main cost when panning (1000 blocks: 22 fps with links, 30 without).

## Quality & CI

- [x] Test coverage report with a threshold in CI. Done: `npm run test:coverage` with thresholds acting as a ratchet. No badge — that needs an external service such as Codecov.
- [x] ~~CI matrix for Node 18 / 20 / 22~~ **20 / 22 / 24**: Node 18 is impossible, Vitest 4 requires `^20 || ^22 || >=24` and ESLint 10 requires `^20.19 || ^22.13 || >=24`. Consumers can still run the ES2020 bundles on Node 18.
- [x] Integration test for the ASP.NET example. Done: `examples/aspnetcore.Tests` (xUnit + `WebApplicationFactory`) covering the empty state, anti-forgery rejection, the save/load round-trip, payload validation and `FileBoardStorage` on a temp directory.
- [x] Bundle-size guard (`size-limit`) failing CI on unexpected growth. The budget is 90 kB against 84 kB today; raise it deliberately, and consider subpath exports for the optional modules if it approaches that.
- [x] Enable Dependabot (npm + NuGet + Actions) and CodeQL scanning. Note: CodeQL cannot autobuild the C# project (its csproj fails by design until `dist/` exists), so the workflow builds it manually.

## Accessibility (partially started)

- [ ] ARIA roles/labels for blocks, action buttons and the link editor popup; focus trap inside the popup; visible focus outlines. The context menu already ships with menu roles and arrow-key navigation.
- [ ] Keyboard-only operation: focus/select blocks, open editors and create links without a mouse.
