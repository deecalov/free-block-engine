# TODO

Last reviewed 2026-09-14. Health: 183 JS tests and 14 .NET tests pass, ESLint
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
- [x] Multi-line editing lost line breaks: Enter becomes `<div>`/`<br>` in browsers and the blur handler saved `textContent` (verified in Chrome 152). Fixed: `contenteditable="plaintext-only"` where supported plus `editableText()` (`src/editableText.js`).
- [x] `duplicateSelected()` dropped the links between the duplicated blocks. Fixed on top of `exportBlocks()` / `importBlocks()`.
- [x] `bringToFront()` grows `zIndex` by one per selection change, so after ~1000 clicks a block painted above the one being dragged (`.dragging` was z-index 1000). Fixed: the gesture layers sit at 1 000 000+, and `normalizeZOrder()` compacts the indices.
- [ ] `bringToFront()` changes persisted state without going through history, so autosave (which listens to `historyChanged`) never picks up a pure z-order change until the next real edit. Options: let Autosave also listen to `blockUpdated` (a save per click, debounced), or stop raising on select and raise only on drag.
- [ ] `arrangeBlocks()` starts at (50, 50), which the grid snaps to (60, 60); harmless but surprising.

## API & developer experience

- [x] Type the event system: a JSDoc event-name → payload map so the generated `.d.ts` gives typed `on`/`off`/`emit` instead of `(data: unknown) => void`. Done: `EngineEventMap` typedef, generic `on`/`off`/`emit`.
- [x] Offer built-in optional keyboard shortcuts in the renderer (Ctrl+Z/Y, Delete, Ctrl+A, Ctrl+D, arrow-key nudge). Done: `keyboardShortcuts` renderer option; the demo uses it.
- [x] Document `arrangeBlocks()` in the README API section and `docs/api.md`. Done.
- [x] Custom block content hook (render markdown/HTML per block type). Done: `renderContent(block, element, { readOnly })` renderer option.
- [x] Autosave helper: a small localStorage adapter with debounce. Done: `Autosave` / `createAutosave()` export with injectable storage.
- [x] Localizable interface strings. Done: `strings` renderer option over `DEFAULT_STRINGS`, `formatString()` for placeholders.
- [x] Fragment API for clipboard / merging: `exportBlocks(ids)` + `importBlocks(fragment, { offset })`. Done.
- [x] Block chrome options (`showBlockId`, `showBlockMeta`, `showLinkChips`) for a sticky-note look. Done; defaults unchanged.
- [ ] Block `style` in the model (background / border / text colour) with undo, instead of pushing hosts to `data` + CSS.
- [ ] Block type registry: `registerBlockType({ name, defaultSize, style, render })` instead of a bare string `type` and one global `renderContent` hook.
- [ ] Tool modes (`setTool('select' | 'hand' | 'connector' | 'text')`) as a state machine in `InteractionController`, and a plugin hook so optional modules stop being hard imports of the renderer (`sideEffects: false` cannot drop them today).

## Features

- [x] ~~Light theme preset~~ **Dark** theme preset and `prefers-color-scheme` support. The original note was wrong: the shipped palette is light, so the missing preset was the dark one. Done: `theme: 'light' | 'dark' | 'auto'` plus ~20 hard-coded colours extracted into `--fbe-*` variables.
- [x] Z-order management: bring a block to front on select/drag, persist an explicit `zIndex`. Done: `bringToFront()` (outside history) and undoable `setBlockZIndex()`, applied through a `--fbe-z` custom property so `.dragging` still wins.
- [x] Snap guides / alignment hints while dragging (edges and centers of neighbouring blocks). Done: `snapGuides` option; snapped positions bypass grid rounding.
- [ ] Edge routing options: straight / orthogonal, plus basic obstacle avoidance. Needs the connector model below and a spatial index.
- [x] Context menu (right-click, long-press on touch) for block and canvas actions. Done: `contextMenu` option with a `contextMenuItems` hook, keyboard navigation and ARIA roles.
- [x] Clipboard (Ctrl+C / X / V), double-click creation, Shift+click multi-select, resize from every side, "Send to back". Done (2026-09-14).
- [ ] Connector creation by dragging from a port on the block border (Miro-style), instead of 🔗 → "+ Add New Link" → click target.
- [ ] Auto-layout algorithms beyond the grid `arrangeBlocks`: tree / layered / force-directed.
- [x] Export the board to PNG/SVG. Done: `exportToSVG()` / `exportToPNG()` on the renderer and as standalone functions.
- [ ] Block grouping / collapsible containers, `locked` flag (long-term).
- [ ] Connector model v3: links as first-class entities with ids, anchors to block sides, waypoints, line style and several links per pair. Today a link lives in a `Map` on the block, so one link per pair and every event addresses a pair of ids. The most expensive migration — design it before other API changes.
- [ ] Collaboration: an operation log (`applyOperation(op)`, an `operation` event with an origin flag, history only for local ops). The closure-based undo stack cannot feed other clients. The same log gives incremental autosave instead of a full JSON per change; a CRDT adapter belongs in a separate package to keep zero dependencies.

## Performance (matters beyond ~500 blocks)

- [x] Viewport culling: skip rendering blocks far outside the visible camera rect. Done: opt-in `cullOffscreen`; drag at 3000 blocks goes from 8 to 21 fps.
- [x] Minimap rebuilds every block `div` on each update (`src/minimap.js`). Done: the nodes are pooled and reused.
- [x] `_buildChips()` calls `getIncomingLinks()` (a full scan) per block, making import O(n²). Done: the engine keeps a reverse link index.
- [x] Add a benchmark page (1k+ blocks) and document practical limits. Done: `benchmarks/stress.html`, figures in `docs/architecture.md`.
- [x] Cull connections as well — the SVG layer still draws every edge and is now the main cost when panning (1000 blocks: 22 fps with links, 30 without). Done: edges carry a bounding box and are hidden by the same pass; the edge layer is also indexed by block so drags relayout only their own edges in place (`src/connectionLayer.js`).
- [ ] Spatial index (grid hash) for blocks: culling, lasso, snap guides (`_alignDrag` scans every block per pointer move) and hit tests are all linear in the block count.
- [ ] Undo of a delete is incremental now; `blocksImported` / `engineCleared` still rebuild everything, which is expected, but `setReadOnly()` and `setViewMode()` also do a full `render()`.
- [ ] Edges in Canvas 2D / WebGL once thousands of SVG paths become the limit (blocks stay in the DOM for contenteditable).

## Quality & CI

- [x] Test coverage report with a threshold in CI. Done: `npm run test:coverage` with thresholds acting as a ratchet. No badge — that needs an external service such as Codecov.
- [x] ~~CI matrix for Node 18 / 20 / 22~~ **20 / 22 / 24**: Node 18 is impossible, Vitest 4 requires `^20 || ^22 || >=24` and ESLint 10 requires `^20.19 || ^22.13 || >=24`. Consumers can still run the ES2020 bundles on Node 18.
- [x] Integration test for the ASP.NET example. Done: `examples/aspnetcore.Tests` (xUnit + `WebApplicationFactory`) covering the empty state, anti-forgery rejection, the save/load round-trip, payload validation and `FileBoardStorage` on a temp directory.
- [x] Bundle-size guard (`size-limit`) failing CI on unexpected growth. The budget was raised from 90 to 100 kB on 2026-09-14 (95 kB after clipboard, fragments, resize, strings and edge culling). About 6 kB of the minified bundle are the repeated per-module `@license` headers, which esbuild keeps; `--legal-comments=linked` would move them to a sidecar file. Subpath exports for the optional modules remain the structural fix.
- [ ] End-to-end browser tests (Playwright) on `example.html`: the line-break bug was invisible to jsdom, as is pointer capture, `plaintext-only` editing and real clipboard events.
- [x] Enable Dependabot (npm + NuGet + Actions) and CodeQL scanning. Note: CodeQL cannot autobuild the C# project (its csproj fails by design until `dist/` exists), so the workflow builds it manually.

## Accessibility (partially started)

- [ ] ARIA roles/labels for blocks, action buttons and the link editor popup; focus trap inside the popup; visible focus outlines. The context menu already ships with menu roles and arrow-key navigation.
- [ ] Keyboard-only operation: focus/select blocks, open editors and create links without a mouse.
