# Free Block Engine 🔗

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/javascript-ES2022-yellow.svg" alt="JavaScript">
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Dependencies">
</p>

<p align="center">
  <strong>A zero-dependency visual block management system for creating interactive, interconnected content</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#api-reference">API</a> •
  <a href="#canvas-controls">Controls</a> •
  <a href="#customization">Customization</a> •
  <a href="#development">Development</a>
</p>

---

## ✨ Features

### Core

- **Visual block management** — create, edit, resize and organize content blocks
- **Typed connections with arrows** — single (→), reverse (←) and bidirectional (↔) links, each drawn with SVG arrow markers and distinct colors
- **Connection labels** — attach a text label to any link, rendered on the edge
- **Clickable edges** — click a connection line to change its direction, edit its label or delete it
- **Undo / Redo** — full history for every operation (create, move, resize, link, import…), with batching for compound actions
- **Zoom & pan camera** — Ctrl+wheel zoom to cursor, Space/middle-mouse pan, pinch zoom on touch devices
- **Lasso selection** — drag on empty canvas to select multiple blocks, drag any selected block to move them all
- **Navigable minimap** — bird's-eye view; click or drag on it to jump around the canvas
- **Read-only mode** — display graphs without allowing edits

### Data

- **Import / Export** — versioned JSON with validation, dangling-link pruning and legacy-format support
- **Custom data** — a serializable `data` payload on every block survives export/import
- **Search** — real-time content search across all blocks

### Engineering

- **Zero dependencies** — pure JavaScript, no runtime packages
- **ESM / CJS / browser global** builds + TypeScript declarations generated from JSDoc
- **Leak-free renderer** — one delegated Pointer Events pipeline, `destroy()` releases everything; multiple instances can coexist on a page
- **Incremental rendering** — engine events update only the affected DOM nodes
- **Tested** — Vitest + jsdom suite for engine and renderer, CI via GitHub Actions

## 📦 Installation

### npm

```bash
npm install free-block-engine
```

```javascript
import { BlockEngine, BlockRenderer } from 'free-block-engine';
```

### Script tag (browser global)

```html
<script src="dist/free-block-engine.global.js"></script>
<script>
  const { BlockEngine, BlockRenderer } = FreeBlockEngine;
</script>
```

## 🚀 Quick Start

```html
<!DOCTYPE html>
<html>
  <body>
    <div id="canvas" style="height: 100vh"></div>

    <script src="dist/free-block-engine.global.js"></script>
    <script>
      const { BlockEngine, BlockRenderer } = FreeBlockEngine;

      const engine = new BlockEngine();
      const renderer = new BlockRenderer(engine, 'canvas');

      const a = engine.createBlock('Hello World!', 'note');
      const b = engine.createBlock('Connected Block');
      engine.linkBlocks(a.id, b.id, 'single', 'depends on');
    </script>
  </body>
</html>
```

Open [example.html](example.html) for a full-featured demo (toolbar, undo/redo, zoom, import/export, read-only mode).

Integrating with a backend? See
[examples/aspnetcore](examples/aspnetcore/README.md) — an ASP.NET Core 10 MVC
app with server-side board persistence (anti-forgery protected REST endpoint,
atomic file storage).

## 📚 API Reference

Full reference with all signatures: [docs/api.md](docs/api.md).

### BlockEngine

```javascript
const engine = new BlockEngine({ gridSize: 20 }); // settings are optional

// Blocks
const block = engine.createBlock(content, type, position, size); // size defaults to 250x150
engine.setBlockContent(block.id, 'new text');
engine.setBlockPosition(block.id, x, y); // snaps to grid
engine.setBlockSize(block.id, width, height); // respects minimums
engine.setBlockData(block.id, { priority: 'high' }); // serializable custom data
engine.duplicateBlock(block.id);
engine.deleteBlock(block.id);
engine.clear();

// Queries
engine.getBlock(id);
engine.getAllBlocks();
engine.getBlocksByType('task');
engine.searchBlocks('query');
engine.getOutgoingLinks(id);
engine.getIncomingLinks(id);

// Links (self-links are rejected)
engine.linkBlocks(fromId, toId, 'single', 'optional label'); // 'single' | 'reverse' | 'double'
engine.updateLinkType(fromId, toId, 'double'); // keeps the label
engine.setLinkLabel(fromId, toId, 'new label');
engine.unlinkBlocks(fromId, toId);
engine.getLinkInfo(fromId, toId); // { type, from, to, label } | null

// Undo / Redo
engine.undo();
engine.redo();
engine.canUndo();
engine.canRedo();
engine.beginBatch('label');
/* several operations */ engine.endBatch(); // one undo step
engine.clearHistory();

// Persistence
const json = engine.exportToJSON();
engine.importFromJSON(json); // validated; returns false on bad payloads

// Settings
engine.updateSettings({ gridSize: 40 }); // unknown keys are ignored
```

### BlockRenderer

```javascript
const renderer = new BlockRenderer(engine, 'container-id', {
  defaultLinkType: 'single', // used by linking mode
  readOnly: false,
  showMinimap: true,
  confirmDelete: true,
  minZoom: 0.2,
  maxZoom: 3,
});

// Camera
renderer.zoomBy(1.2); // multiply zoom (optionally around a pointer)
renderer.setZoom(1.5);
renderer.zoomToFit(); // fit all blocks
renderer.resetView();
renderer.centerOnBlock(id);
renderer.scrollToBlock(id); // center + flash highlight
renderer.onCameraChange = (camera) => console.log(camera.zoom);

// Selection
renderer.selectBlock(id, multiSelect);
renderer.selectAll();
renderer.clearSelection();
renderer.getSelectedBlocks();

// Bulk operations (each is a single undo step)
renderer.linkSelected('double');
renderer.duplicateSelected();
renderer.deleteSelected();

// Linking mode: next clicked block becomes the target
renderer.startLinkingMode(sourceId, 'single');
renderer.setDefaultLinkType('double');

// Modes
renderer.setViewMode('free'); // default: camera canvas with connections
renderer.setViewMode('grid'); // auto-layout grid without connections
renderer.setReadOnly(true);

// Lifecycle — removes all DOM and listeners
renderer.destroy();
```

### Events

```javascript
engine.on('blockCreated', (block) => {});
engine.on('blockUpdated', (block) => {});
engine.on('blockMoved', (block) => {});
engine.on('blockResized', (block) => {});
engine.on('blockDeleted', ({ id, affected }) => {});
engine.on('blockRestored', (block) => {}); // undo of a delete
engine.on('blocksLinked', ({ from, to, linkType, label }) => {});
engine.on('blocksUnlinked', ({ fromId, toId }) => {});
engine.on('linkUpdated', ({ fromId, toId, label }) => {});
engine.on('blocksImported', ({ count }) => {});
engine.on('engineCleared', () => {});
engine.on('blocksArranged', ({ count }) => {});
engine.on('historyChanged', ({ canUndo, canRedo }) => {});
engine.on('settingsUpdated', (settings) => {});

engine.off('blockCreated', handler);
```

A listener that throws is logged and isolated — it cannot break the operation
or the other listeners.

## 🖱️ Canvas Controls

| Action                    | Input                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Move block(s)             | Drag a block (drags the whole selection)                    |
| Resize block              | Drag the right / bottom / corner handle                     |
| Select                    | Click a block                                               |
| Multi-select              | Ctrl+click, or lasso-drag on empty canvas                   |
| Clear selection           | Click empty canvas or press Escape                          |
| Edit content              | Click into the text, Ctrl+Enter to finish                   |
| Edit a connection         | Click the connection line                                   |
| Create a connection       | 🔗 action on a block → "+ Add New Link"                     |
| Zoom                      | Ctrl+wheel (to cursor), pinch on touch                      |
| Pan                       | Space+drag, middle mouse, wheel, touch-drag on empty canvas |
| Cancel linking / gestures | Escape                                                      |

## 🎨 Customization

### Theming with CSS variables

```css
#canvas.blocks-container {
  --fbe-accent: #7c3aed;
  --fbe-bg: #0f172a;
  --fbe-block-bg: #1e293b;
  --fbe-block-border: #334155;
  --fbe-edge-single: #38bdf8;
  --fbe-edge-double: #f472b6;
}
```

Any renderer class (`.block`, `.block-type`, `.fbe-edge`, `.minimap`…) can also
be overridden directly.

### Custom block types and data

```javascript
const block = engine.createBlock('Content', 'important');
engine.setBlockData(block.id, {
  priority: 'high',
  tags: ['review'],
});
// block.data is serialized by exportToJSON() and restored on import.
```

### Engine settings

```javascript
engine.updateSettings({
  gridSize: 20, // grid snapping step
  defaultSpacing: 300, // auto-position spacing
  minBlockWidth: 150,
  minBlockHeight: 100,
  historyLimit: 100, // undo stack depth
});
```

## 🎯 Use Cases

- **Mind mapping** — visual brainstorming and idea organization
- **Project management** — task dependencies and workflow visualization
- **Knowledge graphs** — concept relationships and learning paths
- **System design** — architecture diagrams and component relationships
- **Content planning** — editorial calendars and content relationships

## 🏗️ Architecture

```
free-block-engine/
├── src/
│   ├── index.js            # Public exports
│   ├── block.js            # Block model
│   ├── blockEngine.js      # Core engine: graph, history, persistence, events
│   ├── history.js          # Undo/redo command stack
│   ├── blockRenderer.js    # Rendering layer: camera, incremental DOM updates
│   ├── interaction.js      # Delegated Pointer Events gestures
│   ├── connectionLayer.js  # SVG edges, arrow markers, labels
│   ├── minimap.js          # Navigable minimap
│   ├── linkEditor.js       # Link editor popup (block & edge modes)
│   └── styles.js           # Injected stylesheet (CSS variables)
├── dist/                   # ESM, CJS, browser-global builds + .d.ts
├── tests/                  # Vitest + jsdom suite
├── docs/                   # Architecture and API documentation
└── example.html            # Full-featured demo
```

See [docs/architecture.md](docs/architecture.md) for the design details
(camera model, incremental rendering, history recording).

## 🔧 Development

```bash
npm install        # install dev dependencies
npm run dev        # static dev server for the demo (http://localhost:8123)
npm test           # run the Vitest suite
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # build dist/ (ESM, CJS, global, types)
```

`dist/` is git-ignored (generated output). Run `npm run build` once after
cloning — the demo (`example.html`) loads `dist/free-block-engine.global.js`.
Publishing to npm includes `dist/` automatically via the `files` field, and
`prepublishOnly` rebuilds it before every publish.

## 🤝 Contributing

Contributions are welcome! Please:

1. Maintain zero runtime dependencies
2. Add tests for new behavior
3. Keep JSDoc annotations up to date (they generate the TypeScript types)
4. Update the documentation in `docs/`

## 📄 License

MIT License — feel free to use this in your projects!

---

<p align="center">
  Created with ❤️ by <a href="https://github.com/deecalov">Paul Deecalov</a>
</p>
