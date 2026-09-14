# Architecture

Free Block Engine is split into a DOM-free core (`BlockEngine`) and a
rendering layer (`BlockRenderer`). The two communicate exclusively through
the engine's event system, which keeps the core testable in Node and lets
several renderers observe one engine.

```
┌────────────────────────────────────────────────────────────┐
│ BlockEngine (no DOM)                                       │
│   Block model · links · History (undo/redo) · persistence  │
└──────────────┬─────────────────────────────────────────────┘
               │ events (blockCreated, blockMoved, …)
┌──────────────▼─────────────────────────────────────────────┐
│ BlockRenderer                                              │
│   camera (zoom/pan) · incremental DOM · selection          │
│   ├── InteractionController  (delegated Pointer Events)    │
│   ├── ConnectionLayer        (SVG edges, arrows, labels)   │
│   ├── Minimap                (navigable overview)          │
│   └── LinkEditorPopup        (block & edge editors)        │
└────────────────────────────────────────────────────────────┘

Autosave (optional) subscribes to the engine's events and mirrors
exportToJSON() into a storage backend.
```

## Modules

| Module                   | Responsibility                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `src/block.js`           | `Block` model: content, type, links map, position/size, `data`, (de)serialization |
| `src/history.js`         | Generic undo/redo stack with batching                                             |
| `src/blockEngine.js`     | Graph operations, history recording, JSON import/export, pub/sub                  |
| `src/blockRenderer.js`   | Container/viewport DOM, camera, incremental updates, selection, public UI API     |
| `src/interaction.js`     | All pointer/keyboard gestures via delegation                                      |
| `src/connectionLayer.js` | SVG edge drawing in world coordinates                                             |
| `src/minimap.js`         | Overview map + click/drag navigation                                              |
| `src/linkEditor.js`      | Popup for managing a block's links or a single edge                               |
| `src/styles.js`          | Injected stylesheet, light/dark presets over CSS custom properties                |
| `src/autosave.js`        | Debounced persistence of the JSON export into a storage backend                   |
| `src/snapGuides.js`      | Alignment maths for dragging plus the guide-line overlay                          |
| `src/contextMenu.js`     | Right-click / long-press menu, keyboard operable                                  |
| `src/exporter.js`        | Board to standalone SVG, and PNG through a canvas                                 |
| `src/editableText.js`    | Plain text out of a contenteditable element, `plaintext-only` detection           |
| `src/strings.js`         | Interface strings with placeholders (localization)                                |

## Key decisions

### Camera via CSS transform

The canvas is not scrolled natively. All blocks and the SVG connection layer
live inside `.blocks-viewport`, which gets
`transform: translate(x, y) scale(zoom)`. Consequences:

- World coordinates equal block model coordinates — connection geometry is
  computed from `block.position/size`, never from `getBoundingClientRect()`.
- `screenToWorld`/`worldToScreen` are two one-line affine conversions on the
  renderer.
- The grid background scales by adjusting `background-size`/`background-position`
  on the container.

### One delegated input pipeline

v1 attached `document`-level mouse and touch handlers **per block per
render** and never removed them — the dominant leak. v2 routes every gesture
through a single set of Pointer Events listeners on the container
(`InteractionController`). A gesture is identified on `pointerdown` by hit
testing (`closest('.resize-handle') / closest('.block')` / empty canvas) and
tracked as a small state object. A 4 px threshold separates clicks from
drags, which also fixes the "drag toggles selection" bug.

All listeners (container, window keyboard and clipboard, document click) are
registered with one `AbortController` signal; `renderer.destroy()` aborts it
and removes the DOM. This is what makes multiple instances and SPA usage safe.

The clipboard is driven by the native `copy`/`cut`/`paste` events rather than
the asynchronous Clipboard API: they carry the data synchronously, need no
permission prompt and only fire for a user gesture. The handlers step aside
whenever the event targets an editable element or the page has a text
selection, so the library never hijacks ordinary copying.

### Editable text

Block content is edited in place with `contenteditable`. Browsers turn Enter
into markup — Chrome wraps the new line in a `<div>`, Firefox inserts a
`<br>` — and `textContent` drops both, which silently flattened multi-line
blocks on blur. The renderer now asks for `contenteditable="plaintext-only"`
where the browser reflects it (Enter inserts `\n`, pasted markup is stripped)
and reads the text back through `editableText()`, a small walker that maps
`<br>` and block boundaries to newlines the way `innerText` does — but
deterministically, without layout, so it is testable in jsdom.

### Gesture overrides instead of model mutation

While dragging/resizing, the model is untouched. The renderer keeps a
`gestureOverrides` map (`id → {x, y, width, height}`) that the connection
layer and minimap consult through `renderer.getBlockRect(block)`. On release
the single final `engine.setBlockPosition/Size` call produces exactly one
history entry and one event.

### Incremental rendering

`render()` (full rebuild) runs only for imports, `clear()` and mode
switches. Everything else is incremental, driven by engine events:

| Event                               | DOM effect                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| `blockCreated`                      | append one element, draw its edges                              |
| `blockRestored` (undo of a delete)  | append the element and its edges, refresh the neighbours' chips |
| `blockDeleted { id, affected }`     | remove element, refresh neighbours' link chips                  |
| `blockUpdated`                      | update text/type/chips of one element                           |
| `blockMoved` / `blockResized`       | update inline styles, redraw that block's edges                 |
| `blocksLinked/Unlinked/linkUpdated` | refresh chips of the pair, redraw that pair's edge              |

### History as inverse closures

Every mutating engine method captures the minimal "before" state and records
`{undo, redo}` closures. Undo/redo replays them with recording suppressed
(`_replaying` flag) but with events still emitted, so the renderer updates
normally. Compound operations (`arrangeBlocks`, multi-drag, `linkSelected`,
`duplicateSelected`, `deleteSelected`) wrap their steps in
`beginBatch()/endBatch()` to form one undo step. `deleteBlock` snapshots the
block **and** its incoming links so undo restores the full neighbourhood;
`importFromJSON`/`clear` snapshot the whole document.

### Edges

`ConnectionLayer` renders one `<g class="fbe-edge">` per linked pair:
an invisible wide hit path (`pointer-events: stroke`) for clicking, the
visible bezier path with `marker-end` (and `marker-start` for double links),
a source dot for single links and an optional `<text>` label at the curve
midpoint. Pair state is canonicalized through `engine.getLinkInfo`, so
`single`/`reverse` storage differences never leak into rendering. Marker ids
are per-renderer-instance to allow multiple canvases per page.

Edges are indexed twice: by canonical pair key (`Map<key, EdgeRecord>`) and by
block (`Map<blockId, Map<key, otherId>>`). Moving a block relayouts only the
records in its index, and a relayout writes the new `d`, dot position and
label into the existing elements instead of recreating the group — the
previous implementation ran `querySelectorAll('.fbe-edge')` over every edge
on every pointer move and rebuilt the touched groups from scratch. A record is
rebuilt only when the pair's direction or type changes, and dropped when
`getLinkInfo` no longer reports a link (unlink, block deleted). Each record
keeps a world-space bounding box (the hull of the bezier control points plus
marker and label padding) that the culling pass tests against the view.

## Performance

Three costs dominate large boards, and each is addressed differently:

- **Incoming-link lookups.** `getIncomingLinks()` used to scan every block, and
  it is called per block while rendering and on every pointer move while
  dragging — quadratic behaviour on import and drag. The engine now keeps a
  reverse index (`Map<targetId, Set<sourceId>>`) updated by every link
  mutation and rebuilt on import, making the lookup proportional to the number
  of links a block actually has. `deleteBlock` uses it too instead of scanning.
- **Minimap redraws.** The minimap re-renders on every camera frame; it now
  reuses a pool of nodes instead of recreating one `div` per block per frame.
- **Offscreen blocks.** With `cullOffscreen: true` the renderer hides blocks
  outside the visible world rect (plus `cullMargin`) via `.fbe-offscreen`.
  Elements stay in `blockElements`, so selection, geometry and host queries are
  unaffected. Blocks under an active gesture or containing the focused element
  are never hidden — that would drop the caret mid-edit. During a full
  `render()` visibility is decided _before_ insertion, otherwise the board
  would be laid out twice (that mistake cost 3.8× on first render).
  Culling is off by default and does nothing when the container has no
  measurable size (hidden or not laid out yet).
- **Offscreen edges.** The same pass hides edges whose bounding box misses the
  view. The renderer caches the bounds of its last culling pass and the edge
  layer reads that cache when it relayouts an edge during a drag, so no frame
  measures the container (`clientWidth` would force a synchronous layout
  right after the frame's style writes).
- **Undo of a delete** used to run a full `render()`; it now inserts one
  element, draws its edges and refreshes the neighbours' chips.

### Measurements

`benchmarks/stress.html` (open it through `npm run dev`) generates a board and
measures first render plus pan/drag frame rates. Two runs are recorded here;
treat the _ratios_ as the signal — the absolute numbers are machine-specific.

**Desktop Chrome, July 2026** (GPU compositing, 100% zoom; an empty board tops
out at ~32 fps on that box, so that is the ceiling, not a library limit). This
run predates the edge index and edge culling:

| Board                    | First render | Pan    | Drag   | Blocks in DOM layout |
| ------------------------ | ------------ | ------ | ------ | -------------------- |
| 1000 blocks, 998 links   | 143 ms       | 22 fps | 26 fps | 1000                 |
| …with `cullOffscreen`    | 143 ms       | 21 fps | 31 fps | 36                   |
| 3000 blocks, ~3000 links | 518 ms       | 10 fps | 8 fps  | 3000                 |
| …with `cullOffscreen`    | 476 ms       | 17 fps | 21 fps | 36                   |

Reading the numbers: culling is roughly neutral around a thousand blocks and
clearly pays off beyond that (drag 8 → 21 fps at 3000). Dropping the links
from a 1000-block board lifted panning from 22 to 30 fps on its own, which is
what motivated the edge work below.

**Headless Chrome 152, September 2026** (software rendering, a 1887×2044
viewport, 100% zoom). "Before" is the build without the edge index, edge
culling and lazy resize handles; "after" is the current code. Both were
measured back to back on the same machine with the same script:

| Board                            | First render | Pan      | Drag     | Visible blocks / edges |
| -------------------------------- | ------------ | -------- | -------- | ---------------------- |
| 1000 blocks, 998 links — before  | 104 ms       | 10.4 fps | 26.9 fps | 1000 / 998             |
| …after                           | 81 ms        | 10.8 fps | 26.2 fps | 1000 / 998             |
| …with `cullOffscreen` — before   |              | 11.9 fps | 25.9 fps | 88 / 998               |
| …with `cullOffscreen` — after    |              | 12.0 fps | 28.1 fps | 88 / 216               |
| 3000 blocks, 2998 links — before | 217 ms       | 5.3 fps  | 17.4 fps | 3000 / 2998            |
| …after                           | 212 ms       | 5.4 fps  | 19.0 fps | 3000 / 2998            |
| …with `cullOffscreen` — before   |              | 7.5 fps  | 17.5 fps | 88 / 2998              |
| …with `cullOffscreen` — after    |              | 8.4 fps  | 22.9 fps | 88 / 271               |

Reading these: the edge index and the lazy handles pay off where the work is
per element or per frame — first render at 1000 blocks drops by a fifth and
dragging at 3000 blocks with culling gains about 30%. Panning barely moves in
this software-rendered setup; its per-frame floor is the raster of the
viewport layer plus the minimap update, which still touches every block per
frame, not the edges. Two regressions were caught on the way and are worth
remembering: eight eagerly created resize handles per block cost ~70% on first
render (104 → 175 ms at 1000 blocks), and `vector-effect: non-scaling-stroke`
on the edge hit paths cut panning at 3000 blocks from 5.3 to 0.5 fps, because
the browser re-evaluates every such path on each transform change. The next
per-frame cost to attack is the minimap, then a spatial index for culling,
lasso and snapping.

## Build & packaging

- `esbuild` bundles `src/index.js` into ESM, CJS and an IIFE browser global
  (`FreeBlockEngine`); `tsc` emits `.d.ts` from JSDoc (`tsconfig.types.json`).
- `dist/` is git-ignored (generated output). Run `npm run build` after cloning
  to produce it — the demo loads `dist/free-block-engine.global.js`. npm
  publishing ships `dist/` via the `files` field; `prepublishOnly` rebuilds it.
- Quality gates: ESLint (flat config) + Prettier + Vitest (jsdom) in GitHub
  Actions (`.github/workflows/ci.yml`).

## Testing notes

- The engine suite covers graph operations, validation, persistence
  round-trips and undo/redo semantics.
- The renderer suite runs in jsdom with small `PointerEvent` and `confirm`
  polyfills (`tests/setup.js`). Because edge geometry is model-based,
  connection tests work without a layout engine.
- jsdom performs no layout, so `clientWidth`/`clientHeight` are 0. Tests that
  need a measurable viewport (culling, paste placement) define those
  properties on the container.
- jsdom has neither `innerText` nor `ClipboardEvent`/`DataTransfer`. Editable
  text goes through `editableText()` precisely so it can be tested on
  hand-built markup; clipboard tests dispatch plain events with an in-memory
  `clipboardData` stand-in. What jsdom cannot show — how a real browser turns
  Enter into markup — was verified once by hand in Chrome and is the reason
  the helper exists; an end-to-end browser suite is still on the TODO list.
- Coverage thresholds in `vitest.config.js` are a ratchet set to the measured
  floor; raise them when a change lifts the numbers.
