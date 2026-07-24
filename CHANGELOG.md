# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Typed engine events: the generated TypeScript declarations expose
  `EngineEventMap`, and `on`/`off`/`emit` are generic over its keys, so the
  payload type is inferred from the event name.
- Optional built-in keyboard shortcuts (`keyboardShortcuts` renderer
  option): Ctrl/Cmd+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, Ctrl+A select all,
  Ctrl+D duplicate, Delete/Backspace delete the selection (honours
  `confirmDelete`), arrow keys nudge the selection by a grid step
  (Shift: 1 px without snapping). The demo now uses them instead of its
  own document-level bindings.
- `renderContent(block, element, { readOnly })` renderer option — custom
  block content rendering (markdown, HTML, widgets). Return `true` to take
  ownership; falsy returns and thrown errors fall back to plain text.
- `Autosave` / `createAutosave(engine, options)` export — debounced
  persistence into localStorage or any compatible storage backend, with
  `load()`, `flush()`, `clear()` and `destroy()`.
- Documented `arrangeBlocks()` in the README API section.

### Fixed

- `duplicateBlock()` recorded history before copying the custom `data`
  payload, so redoing an undone duplicate silently dropped the data. The
  copy is now recorded as one batch of create + `setBlockData`.
- Nested `beginBatch()`/`endBatch()` pairs: the first `endBatch()` closed
  the outer batch prematurely. Batches now track nesting depth and close
  on the outermost `endBatch()`.
- `updateSettings({ historyLimit })` and snapshot import now propagate the
  new limit to the existing undo stack (`History.setLimit()`), trimming
  the oldest entries when the limit shrinks.
- Documented the `linksChanged({ fromId, toId })` event (emitted when
  undo/redo replays a link change) in the README events list.

## [2.0.0] — 2026-07-23

Complete overhaul: npm packaging, leak-free renderer rewrite, undo/redo and a
zoom/pan canvas. Breaking changes are listed at the bottom.

### Added

- **npm package**: ESM (`dist/index.js`), CJS (`dist/index.cjs`) and browser
  global (`dist/free-block-engine.global.js`, `FreeBlockEngine`) builds plus
  TypeScript declarations generated from JSDoc.
- **Undo/Redo**: every engine operation is recorded; `undo()`, `redo()`,
  `canUndo()`, `canRedo()`, `beginBatch()/endBatch()`, `clearHistory()` and the
  `historyChanged` event. Deleting a block restores its links on undo.
- **Zoom & pan camera**: Ctrl+wheel zoom to cursor, Space/middle-mouse pan,
  wheel scrolling, pinch zoom on touch; `zoomBy`, `setZoom`, `zoomToFit`,
  `resetView`, `centerOn`, `centerOnBlock`, `onCameraChange`.
- **Arrow markers on connections**: single links draw a source dot and a target
  arrowhead; bidirectional links draw arrowheads on both ends in a distinct
  color.
- **Connection labels**: optional `label` argument on `linkBlocks`,
  `setLinkLabel(fromId, toId, label)`, labels survive type changes and
  export/import, rendered on the edge midpoint.
- **Clickable edges**: clicking a connection line opens an editor for
  direction, label and deletion (the old demo tip promised this; now it works).
- **Lasso selection** on empty canvas, multi-block drag of the selection,
  `selectAll`, `selectInRect`, `duplicateSelected` (Ctrl+D in the demo),
  `deleteSelected`, `linkSelected` as a single undo step.
- **Navigable minimap**: click/drag navigates; lives inside the container so
  multiple renderer instances can coexist.
- **Read-only mode**: `readOnly` option and `setReadOnly()`.
- **Renderer lifecycle**: `destroy()` detaches every listener (one
  AbortController) and removes all DOM.
- **Engine API**: `clear()`, `getBlocksByType()`, `updateSettings()`,
  `setBlockData()`, `duplicateBlock()`, `LINK_TYPES`, `DEFAULT_BLOCK_SIZE`.
- **Custom data**: `block.data` is serialized by `exportToJSON()` and restored
  on import (legacy `customData` fields are migrated).
- Tooling: Vitest + jsdom test suite (56 tests), ESLint flat config, Prettier,
  GitHub Actions CI, static dev server (`npm run dev`).

### Fixed

- **Event listener leaks**: drag/resize previously attached
  `mousemove/mouseup/touchmove/touchend` handlers to `document` per block per
  render and never removed them; the minimap leaked a `scroll` listener per
  update. All input now flows through one delegated Pointer Events pipeline.
- **Self-links**: `linkBlocks(id, id)` is rejected (previously produced NaN
  SVG paths).
- **Import robustness**: `importFromJSON` validates the payload, tolerates
  missing `metadata`/`size`/`position` (the old renderer crashed on missing
  metadata), prunes links to non-existent blocks and imports only known
  settings keys.
- **Inconsistent default size**: block constructor said 250x250 while import
  and docs said 250x150; now 250x150 everywhere (`DEFAULT_BLOCK_SIZE`).
- **Selection toggling after drag**: moving a block no longer flips its
  selection; a click/drag threshold separates the two, and plain click no
  longer toggles a selected block off.
- **Event listener isolation**: a throwing subscriber is logged and skipped
  instead of breaking the engine operation and remaining listeners.
- **Demo Delete hotkey** never fired (`!e.target.contentEditable` is always
  false — the property is a string); now uses `isContentEditable`.
- **Renderer coupling to the demo DOM**: linking mode read
  `#linkTypeSelect` from the host page; now the link type is a renderer
  option (`defaultLinkType` / `setDefaultLinkType`).
- Mobile: pointer events with `touch-action: none` replace the half-working
  mouse+touch duplication (page no longer scrolls while dragging a block).
- IDs use `crypto.randomUUID()` when available; deprecated `substr` removed.

### Changed

- Source moved to `src/` as ES modules; the two root script files were
  removed. For `<script>` usage include `dist/free-block-engine.global.js`
  and read classes from the `FreeBlockEngine` global (see Breaking changes).
- Full re-render replaced by incremental DOM updates driven by engine events.
- Canvas navigation is camera-based (CSS transform) instead of native
  scrolling; the grid background scales with zoom.
- Stylesheet is themeable via CSS custom properties (`--fbe-*`).
- `blockDeleted` event payload now includes `affected` — ids of blocks whose
  links changed because of the deletion.

### Breaking changes

- Global script usage: `BlockEngine`/`BlockRenderer` are no longer top-level
  globals — use `const { BlockEngine, BlockRenderer } = FreeBlockEngine;`.
- `BlockRenderer` no longer reads `#linkTypeSelect`; pass
  `{ defaultLinkType }` or call `setDefaultLinkType()`.
- Red circle endpoints were replaced by arrow markers; the `.link-endpoint`
  CSS hook is gone (use `.fbe-edge`, `.edge-path`, `.edge-dot`).
- `linkSelected()` returns `false` instead of calling `alert()` when fewer
  than two blocks are selected, and no longer clears the selection.
- New blocks default to 250x150 (previously 250x250 at runtime).

## [1.0.0] — 2025-08-05

Initial release: block creation, drag & drop, resizing, single/reverse/double
links, JSON import/export, search, minimap, grid view, example page.
