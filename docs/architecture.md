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
| `src/styles.js`          | Injected stylesheet, themeable via CSS custom properties                          |

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

All listeners (container, window keyboard, document click) are registered
with one `AbortController` signal; `renderer.destroy()` aborts it and removes
the DOM. This is what makes multiple instances and SPA usage safe.

### Gesture overrides instead of model mutation

While dragging/resizing, the model is untouched. The renderer keeps a
`gestureOverrides` map (`id → {x, y, width, height}`) that the connection
layer and minimap consult through `renderer.getBlockRect(block)`. On release
the single final `engine.setBlockPosition/Size` call produces exactly one
history entry and one event.

### Incremental rendering

`render()` (full rebuild) runs only for imports, undo-restores and mode
switches. Everything else is incremental, driven by engine events:

| Event                               | DOM effect                                         |
| ----------------------------------- | -------------------------------------------------- |
| `blockCreated`                      | append one element, draw its edges                 |
| `blockDeleted { id, affected }`     | remove element, refresh neighbours' link chips     |
| `blockUpdated`                      | update text/type/chips of one element              |
| `blockMoved` / `blockResized`       | update inline styles, redraw that block's edges    |
| `blocksLinked/Unlinked/linkUpdated` | refresh chips of the pair, redraw that pair's edge |

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
- The renderer suite runs in jsdom with a small `PointerEvent` polyfill
  (`tests/setup.js`). Because edge geometry is model-based, connection tests
  work without a layout engine.
