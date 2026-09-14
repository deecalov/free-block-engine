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
  DEFAULT_STRINGS, // every interface string with its English default
  formatString, // fills {placeholders} in a string
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
| `sendToBack(id)`                                 | `boolean`       | Undoable; lowers the block, keeping every index ≥ 0                        |
| `setBlockZIndex(id, zIndex)`                     | `boolean`       | Undoable; explicit stacking order                                          |
| `normalizeZOrder()`                              | `boolean`       | Undoable; compacts the order to `0..n-1`; `false` when already compact     |
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

#### Fragments

A fragment is a subset of the board: `{ version, blocks }` where the links are
restricted to the blocks in the subset. Fragments back the clipboard and
`duplicateSelected()`, and let you merge blocks from one board into another.

| Method                            | Returns   | Notes                                                                                                                                                                                                                                   |
| --------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exportBlocks(ids)`               | `object`  | Serializable; unknown ids are skipped                                                                                                                                                                                                   |
| `importBlocks(fragment, options)` | `Block[]` | Undoable (one step). Accepts a fragment, a full export or their JSON text. Creates blocks with fresh ids, copies `data`, reproduces the links among them, stacks them on top. `options.offset` shifts positions. Bad input returns `[]` |

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

| Option                | Default     | Meaning                                    |
| --------------------- | ----------- | ------------------------------------------ |
| `defaultLinkType`     | `'single'`  | Used by linking mode and `linkSelected()`  |
| `readOnly`            | `false`     | Disable all editing interactions           |
| `showMinimap`         | `true`      | Mount the minimap                          |
| `confirmDelete`       | `true`      | `window.confirm` before deleting           |
| `minZoom` / `maxZoom` | `0.2` / `3` | Camera zoom bounds                         |
| `keyboardShortcuts`   | `false`     | Built-in hotkeys (see below)               |
| `renderContent`       | `null`      | Custom content renderer hook (see below)   |
| `theme`               | `'light'`   | `'light'`, `'dark'` or `'auto'`            |
| `snapGuides`          | `false`     | Alignment snapping while dragging          |
| `snapThreshold`       | `6`         | Screen px within which alignment applies   |
| `contextMenu`         | `false`     | Right-click and long-press menu            |
| `contextMenuItems`    | `null`      | `(target, defaults) => items` hook         |
| `cullOffscreen`       | `false`     | Hide blocks and edges outside the viewport |
| `cullMargin`          | `400`       | Margin kept visible when culling           |
| `strings`             | `null`      | Interface string overrides (see below)     |
| `showBlockId`         | `true`      | Shortened id in the block header           |
| `showBlockMeta`       | `true`      | Creation date under the content            |
| `showLinkChips`       | `true`      | "Connections" chip list on blocks          |

The container must have a height (the stylesheet sizes it `100%`).

### Pointer gestures

Double-click on empty canvas creates a block at that point, selects it and
focuses its content (`createBlockAt()`); double-clicks on blocks belong to the
content editor. Ctrl/Cmd+click and Shift+click both extend the selection.
Blocks resize from all four edges and corners; dragging a left or top handle
keeps the opposite edge in place and is recorded as one undo step. The handles
are created when a block is first hovered or selected, not up front, so a
board of thousands of blocks does not carry eight extra elements each.

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
| Ctrl+C / Ctrl+X       | Copy / cut the selection to the clipboard             |
| Ctrl+V                | Paste blocks, or plain text as a new block            |

Shortcuts are ignored while an input, textarea, select or contenteditable
element has focus; mutating shortcuts are disabled in read-only mode. Enable
the option on one renderer per page — every enabled instance reacts to the
same window events.

### Clipboard

Copy and cut put `copySelection()` — an `exportBlocks()` fragment as JSON —
on the clipboard as `text/plain`, so blocks travel between boards, tabs and
sessions. They step aside when text is selected on the page or an editor has
focus, so ordinary copying keeps working. Paste (`paste(text)`) recognises a
fragment or a full export and creates the blocks with fresh ids and the links
among them: offset by two grid steps when the originals are in view,
otherwise centered in the viewport. Any other text becomes one block at the
viewport center. The new blocks are selected; each paste is one undo step.

### Localization

`strings` overrides any entry of `DEFAULT_STRINGS`; keys left out keep their
English default. Placeholders in braces (`{count}`, `{date}`) are filled by
`formatString()`, which is exported as well. `renderer.t(key, vars)` returns
the resolved string, for hosts that add their own menu items.

| Group         | Keys                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block chrome  | `contentPlaceholder`, `manageLinks`, `deleteBlock`, `connections`, `created`                                                                                                                                          |
| Confirmations | `confirmDeleteBlock`, `confirmDeleteBlocks`                                                                                                                                                                           |
| Link editor   | `linkEditorTitle`, `edgeEditorTitle`, `addLink`, `labelPlaceholder`, `emptyContent`, `directionForward`, `directionBackward`, `directionBoth`, `deleteLink`, `close`                                                  |
| Context menu  | `menuDuplicate`, `menuAddLink`, `menuManageLinks`, `menuBringToFront`, `menuSendToBack`, `menuCenterOnBlock`, `menuDelete`, `menuDeleteBlocks`, `menuSelectAll`, `menuZoomToFit`, `menuResetView`, `menuNewBlockHere` |

### Block chrome

`showBlockId`, `showBlockMeta` and `showLinkChips` switch off the id in the
header, the creation date and the "Connections" chip list. The type badge
and the action buttons stay; edges are unaffected.

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

| Method                                  | Notes                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `selectBlock(id, multiSelect?)`         | Plain select replaces; multi toggles                                      |
| `selectAll()` / `clearSelection()`      |                                                                           |
| `selectInRect(worldRect, additive?)`    | Used by the lasso                                                         |
| `getSelectedBlocks()`                   | `Block[]`                                                                 |
| `linkSelected(linkType?)`               | Chains the selection; one undo step; `false` if <2                        |
| `duplicateSelected()`                   | Returns the copies and selects them; links among the selection are copied |
| `deleteSelected()`                      | Returns the count; one undo step                                          |
| `createBlockAt(world, content?, type?)` | Create, select and focus a block; `null` in read-only mode                |
| `focusBlockContent(id)`                 | Put the caret into a block's editor                                       |
| `copySelection()`                       | Fragment JSON of the selection, or `null`                                 |
| `paste(text)`                           | Fragment or plain text → new, selected blocks                             |

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
| `getCullBounds()`                             | World rect in effect for culling, or `null`             |
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

The presets cover the renderer's own DOM only — your toolbars, sidebars and
page background are yours to theme. The usual arrangement is to mirror the
resolved scheme onto an ancestor element:

```javascript
renderer.onThemeChange = (theme) => document.body.classList.toggle('dark', theme === 'dark');
document.body.classList.toggle('dark', renderer.getTheme() === 'dark');
```

Both bundled examples do exactly this; see `examples/aspnetcore/site.css`.

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
culled while the container has no measurable size. Edges are culled by their
bounding box, so an edge running from a visible block to a hidden one stays
visible. The bounds are re-evaluated on camera changes and block moves;
after resizing the container call `applyCulling()`. See
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

The backend does not have to be Web Storage: anything with
`getItem`/`setItem`/`removeItem` qualifies, including an adapter that POSTs
to a server (`setItem` is synchronous by contract, so fire the request
without awaiting it and report the outcome elsewhere). The ASP.NET Core
example ships exactly that, including a `pagehide` flush with
`fetch(..., { keepalive: true })`.
