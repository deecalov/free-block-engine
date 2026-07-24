# API Reference

Exports of the `free-block-engine` package:

```javascript
import {
  BlockEngine, // core engine
  BlockRenderer, // rendering layer
  Block, // block model class
  History, // undo/redo stack (used internally, exported for extension)
  Autosave, // debounced storage persistence helper
  createAutosave, // factory for Autosave
  ContextMenu, // context menu component (used internally)
  exportToSVG, // board → standalone SVG markup
  exportToPNG, // board → PNG blob (browser only)
  findAlignment, // pure alignment maths behind the snap guides
  LINK_TYPES, // ['single', 'reverse', 'double']
  DEFAULT_BLOCK_SIZE, // { width: 250, height: 150 }
  connectionPoint, // pure geometry helper used by the connection layer
} from 'free-block-engine';
```

The browser-global build exposes the same names under `window.FreeBlockEngine`.

---

## BlockEngine

### `new BlockEngine(settings?)`

| Setting          | Default | Meaning                         |
| ---------------- | ------- | ------------------------------- |
| `gridSize`       | `20`    | Snap step for positions         |
| `defaultSpacing` | `300`   | Auto-position / arrange spacing |
| `minBlockWidth`  | `150`   | Lower bound for `setBlockSize`  |
| `minBlockHeight` | `100`   | Lower bound for `setBlockSize`  |
| `historyLimit`   | `100`   | Max undo entries                |

### Blocks

| Method                                           | Returns         | Notes                                                                      |
| ------------------------------------------------ | --------------- | -------------------------------------------------------------------------- |
| `createBlock(content?, type?, position?, size?)` | `Block`         | Auto-positions to the right of the rightmost block when `position` omitted |
| `getBlock(id)`                                   | `Block \| null` |                                                                            |
| `getAllBlocks()`                                 | `Block[]`       |                                                                            |
| `getBlocksByType(type)`                          | `Block[]`       |                                                                            |
| `searchBlocks(query)`                            | `Block[]`       | Case-insensitive content search                                            |
| `setBlockContent(id, content)`                   | `boolean`       | Undoable                                                                   |
| `setBlockPosition(id, x, y, snapToGrid = true)`  | `boolean`       | Undoable; snaps to `gridSize`                                              |
| `setBlockSize(id, width, height)`                | `boolean`       | Undoable; clamps to minimums                                               |
| `setBlockData(id, data)`                         | `boolean`       | Undoable; replaces the serializable `data` payload                         |
| `duplicateBlock(id)`                             | `Block \| null` | Copies content/type/size/data (not links), offsets position                |
| `bringToFront(id)`                               | `boolean`       | Raises the block; **not** undoable, but persisted by export                |
| `setBlockZIndex(id, zIndex)`                     | `boolean`       | Undoable; explicit stacking order                                          |
| `deleteBlock(id)`                                | `boolean`       | Undoable; removes all links pointing at the block                          |
| `clear()`                                        | `void`          | Undoable; removes everything                                               |
| `arrangeBlocks(columns = 3)`                     | `void`          | Grid layout; one undo step                                                 |
| `getAutoPosition()`                              | `{x, y}`        |                                                                            |
| `generateId()`                                   | `string`        | `block_<uuid>` via `crypto.randomUUID` when available                      |

### Links

Link types: `'single'` (from → to), `'reverse'` (to → from), `'double'` (both).
Self-links and unknown types are rejected (`false`).

| Method                                        | Returns          | Notes                                                 |
| --------------------------------------------- | ---------------- | ----------------------------------------------------- |
| `linkBlocks(fromId, toId, linkType?, label?)` | `boolean`        | Undoable; replaces any existing link between the pair |
| `updateLinkType(fromId, toId, newType)`       | `boolean`        | Preserves the label                                   |
| `setLinkLabel(fromId, toId, label)`           | `boolean`        | Undoable; `false` if the pair is not linked           |
| `unlinkBlocks(fromId, toId)`                  | `boolean`        | Undoable; `false` if nothing to unlink                |
| `getLinkInfo(fromId, toId)`                   | `object \| null` | `{ type, from, to, label }`, canonical direction      |
| `getOutgoingLinks(id)`                        | `Block[]`        |                                                       |
| `getIncomingLinks(id)`                        | `Block[]`        | Served from a reverse index; ordered by link creation |

The engine maintains that reverse index internally, so mutating `block.links`
directly (rather than through the methods above) leaves it stale. As with the
direct model setters, go through the engine.

### Undo / Redo

| Method                              | Returns                             |
| ----------------------------------- | ----------------------------------- |
| `undo()` / `redo()`                 | `boolean` — whether applied         |
| `canUndo()` / `canRedo()`           | `boolean`                           |
| `beginBatch(label?)` / `endBatch()` | group operations into one undo step |
| `clearHistory()`                    | drop the stacks                     |
| `getHistoryState()`                 | `{ canUndo, canRedo }`              |

### Persistence

| Method                 | Returns   | Notes                                                                                                                               |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `exportToJSON()`       | `string`  | `{ version, blocks, settings, exportedAt }`; includes `data` and link labels                                                        |
| `importFromJSON(json)` | `boolean` | Undoable. Validates payload; tolerates legacy link arrays and `customData`; prunes dangling links; imports only known settings keys |

### Settings & events

| Method                             | Notes                                         |
| ---------------------------------- | --------------------------------------------- |
| `updateSettings(partial)`          | Unknown keys ignored; emits `settingsUpdated` |
| `on(event, cb)` / `off(event, cb)` | Subscribe/unsubscribe                         |
| `emit(event, data)`                | Throwing listeners are logged and isolated    |

Events: `blockCreated(block)`, `blockUpdated(block)`, `blockMoved(block)`,
`blockResized(block)`, `blockDeleted({id, affected})`, `blockRestored(block)`,
`blocksLinked({from, to, linkType, label})`, `blocksUnlinked({fromId, toId})`,
`linkUpdated({fromId, toId, label})`, `linksChanged({fromId, toId})` (undo/redo
of link operations), `blocksImported({count})`, `engineCleared()`,
`blocksArranged({count})`, `historyChanged({canUndo, canRedo})`,
`settingsUpdated(settings)`.

Event names and payloads are typed: the generated declarations expose
`EngineEventMap`, and `on`/`off`/`emit` are generic over its keys, so
TypeScript infers the payload type from the event name.

---

## Block

| Member                  | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| `id`, `content`, `type` | Identity and payload                                 |
| `position` / `size`     | `{x, y}` / `{width, height}` (default 250x150)       |
| `zIndex`                | Stacking order; higher paints above lower (0)        |
| `links`                 | `Map<blockId, {type, label, createdAt}>`             |
| `data`                  | Custom serializable object (survives export/import)  |
| `metadata`              | `{createdAt, updatedAt}` ISO strings                 |
| `toJSON()`              | Serializable representation                          |
| `Block.fromJSON(raw)`   | Restore; tolerates legacy formats and missing fields |

Prefer mutating blocks through engine methods — direct setters
(`setContent`, `setPosition`, …) bypass events and undo history.

---

## BlockRenderer

### `new BlockRenderer(engine, containerOrId, options?)`

| Option                | Default     | Meaning                                   |
| --------------------- | ----------- | ----------------------------------------- |
| `defaultLinkType`     | `'single'`  | Used by linking mode and `linkSelected()` |
| `readOnly`            | `false`     | Disable all editing interactions          |
| `showMinimap`         | `true`      | Mount the minimap                         |
| `confirmDelete`       | `true`      | `window.confirm` before deleting          |
| `minZoom` / `maxZoom` | `0.2` / `3` | Camera zoom bounds                        |
| `keyboardShortcuts`   | `false`     | Built-in hotkeys (see below)              |
| `renderContent`       | `null`      | Custom content renderer hook (see below)  |
| `theme`               | `'light'`   | `'light'`, `'dark'` or `'auto'`           |
| `snapGuides`          | `false`     | Alignment snapping while dragging         |
| `snapThreshold`       | `6`         | Screen px within which alignment applies  |
| `contextMenu`         | `false`     | Right-click and long-press menu           |
| `contextMenuItems`    | `null`      | `(target, defaults) => items` hook        |
| `cullOffscreen`       | `false`     | Hide blocks outside the viewport          |
| `cullMargin`          | `400`       | Margin kept visible when culling          |

The container must have a height (the stylesheet sizes it `100%`).

### Keyboard shortcuts

With `keyboardShortcuts: true` the renderer listens on its window:

| Keys                  | Action                                                |
| --------------------- | ----------------------------------------------------- |
| Ctrl/Cmd+Z            | Undo                                                  |
| Ctrl+Y, Ctrl+Shift+Z  | Redo                                                  |
| Ctrl+A                | Select all (also in read-only mode)                   |
| Ctrl+D                | Duplicate the selection                               |
| Delete / Backspace    | Delete the selection (honours `confirmDelete`)        |
| Arrows / Shift+Arrows | Nudge the selection by `gridSize` / by 1 px (no snap) |

Shortcuts are ignored while an input, textarea, select or contenteditable
element has focus; mutating shortcuts are disabled in read-only mode. Enable
the option on one renderer per page — every enabled instance reacts to the
same window events.

### Custom content rendering

`renderContent(block, element, { readOnly })` is called for the
`.block-content` element on creation and on every content update (the same
element is reused — clear or patch it yourself). Return `true` to take
ownership: the built-in plain-text rendering and inline editing are skipped
for that block. Any falsy return (or a thrown error, which is logged) falls
back to the default behavior. Sanitize any HTML you inject.

### Camera

| Method                                                      | Notes                                             |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `zoomBy(factor, pointer?)`                                  | Multiplies zoom around a screen point (or center) |
| `setZoom(zoom, pointer?)`                                   | Absolute zoom                                     |
| `zoomToFit(padding = 60)`                                   | Fit all blocks                                    |
| `resetView()`                                               | Camera to origin, zoom 1                          |
| `centerOn({x, y})`                                          | Center a world point                              |
| `centerOnBlock(id)`                                         |                                                   |
| `scrollToBlock(id)`                                         | Center + flash highlight                          |
| `screenToWorld(clientX, clientY)` / `worldToScreen({x, y})` | Coordinate conversion                             |
| `getViewRect()`                                             | Visible world rect                                |
| `onCameraChange`                                            | Assignable callback `(camera) => {}`              |

### Selection & bulk operations

| Method                               | Notes                                              |
| ------------------------------------ | -------------------------------------------------- |
| `selectBlock(id, multiSelect?)`      | Plain select replaces; multi toggles               |
| `selectAll()` / `clearSelection()`   |                                                    |
| `selectInRect(worldRect, additive?)` | Used by the lasso                                  |
| `getSelectedBlocks()`                | `Block[]`                                          |
| `linkSelected(linkType?)`            | Chains the selection; one undo step; `false` if <2 |
| `duplicateSelected()`                | Returns the copies and selects them                |
| `deleteSelected()`                   | Returns the count; one undo step                   |

### Linking & editors

| Method                                             | Notes                                                 |
| -------------------------------------------------- | ----------------------------------------------------- |
| `startLinkingMode(sourceId, linkType?)`            | Next clicked block becomes the target; Escape cancels |
| `setDefaultLinkType(type)`                         |                                                       |
| `openLinkEditor(blockId)`                          | Popup listing all connections of the block            |
| `openEdgeEditor(fromId, toId, {clientX, clientY})` | Popup for one connection (edge click does this)       |

### Modes & lifecycle

| Method                                        | Notes                                                   |
| --------------------------------------------- | ------------------------------------------------------- |
| `setViewMode(mode)`                           | `'free'` (camera canvas) or `'grid'` (auto-layout list) |
| `setReadOnly(readOnly)`                       |                                                         |
| `setTheme(theme)` / `getTheme()`              | Switch scheme; `getTheme()` resolves `'auto'`           |
| `onThemeChange`                               | Callback fired when an `auto` theme follows the OS      |
| `setCullOffscreen(enabled)`                   | Toggle culling; `applyCulling()` forces a pass          |
| `exportToSVG(options?)`                       | Standalone SVG markup of the whole board                |
| `exportToPNG(options?)`                       | `Promise<Blob>`; needs a browser (canvas)               |
| `openContextMenu({clientX, clientY, target})` | Open the menu programmatically                          |
| `render()`                                    | Full rebuild (rarely needed — updates are incremental)  |
| `updateConnections()` / `updateMinimap()`     | Manual refresh helpers                                  |
| `destroy()`                                   | Removes all DOM and detaches every listener             |

### Themes

`theme` accepts `'light'`, `'dark'` or `'auto'`. Both presets are built from
the `--fbe-*` custom properties, so overriding those is enough for a custom
palette. `'auto'` adds the `fbe-theme-auto` class, which a
`prefers-color-scheme` media query picks up; the renderer also subscribes to
the media query and reports flips through `onThemeChange`. `getTheme()`
resolves `'auto'` to the scheme actually in effect. The subscription is
dropped by `setTheme()` and `destroy()`.

### Alignment guides

With `snapGuides` the dragged block aligns to the edges and centers of its
neighbours within `snapThreshold` screen pixels, drawing guide lines. When an
alignment is active the position is committed **without** grid rounding —
otherwise the grid would immediately pull the block off the alignment. The
underlying maths is exported as `findAlignment(moving, others, threshold)`.

### Context menu

`contextMenu` adds a right-click and touch long-press (500 ms) menu with
`role="menu"`, arrow/Home/End navigation and Escape to close. A finger that
travels more than a few pixels cancels the long press, so panning is
unaffected. In read-only mode the mutating entries are omitted.
`contextMenuItems(target, defaults)` receives
`{ type: 'block' | 'canvas', blockId, world }` and returns the items:
`{ label, action?, separator?, disabled? }`. A thrown hook is logged and
suppresses the menu.

### Offscreen culling

`cullOffscreen` hides blocks further than `cullMargin` from the visible world
rect by toggling `.fbe-offscreen`. Elements stay in the renderer's map, so
selection, geometry and host queries are unaffected. Blocks under an active
gesture or containing the focused element are never hidden, and nothing is
culled while the container has no measurable size. See
[architecture.md](architecture.md) for the measured effect.

### Image export

`exportToSVG(engine, options?)` and the renderer method of the same name build
the SVG from the model, so the output does not depend on the current camera or
on which blocks are rendered. Options: `padding` (40), `theme`
(`'light'`/`'dark'`; the renderer method defaults to its own theme) and
`background` (true). Text is drawn with `<text>` and wrapped by estimated
character width — `<foreignObject>` would look better but several browsers
refuse to rasterize it.

`exportToPNG(engine, options?)` additionally takes `scale` (2) and returns a
`Promise<Blob>`. It rejects outside a browser or without canvas support.

### Theming

The injected stylesheet reads CSS custom properties from
`.blocks-container`; override them on your container:

`--fbe-accent`, `--fbe-accent-strong`, `--fbe-danger`, `--fbe-bg`,
`--fbe-grid-line`, `--fbe-block-bg`, `--fbe-block-border`,
`--fbe-block-selected-bg`, `--fbe-text-muted`, `--fbe-edge-single`,
`--fbe-edge-double`.

---

## Autosave

`createAutosave(engine, options?)` (or `new Autosave(engine, options?)`)
persists the engine export into a Web Storage-compatible backend with
debounced writes. Saving is triggered by `historyChanged` — fired by every
mutating operation, undo/redo, import and clear — and by `settingsUpdated`.
Without a storage backend (e.g. during SSR) the helper stays inert.

| Option       | Default                   | Meaning                                      |
| ------------ | ------------------------- | -------------------------------------------- |
| `key`        | `'free-block-engine'`     | Storage key                                  |
| `debounceMs` | `500`                     | Delay after the last change before writing   |
| `storage`    | `globalThis.localStorage` | Any `getItem`/`setItem`/`removeItem` backend |

| Method      | Returns   | Notes                                               |
| ----------- | --------- | --------------------------------------------------- |
| `load()`    | `boolean` | Imports the saved board; `false` when nothing saved |
| `flush()`   | `void`    | Write immediately, cancelling the pending debounce  |
| `clear()`   | `void`    | Remove the saved entry                              |
| `destroy()` | `void`    | Unsubscribe from the engine and stop saving         |

Storage errors (quota, privacy mode) are caught and logged — they never
break the engine operation that triggered the save.
