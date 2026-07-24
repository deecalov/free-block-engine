/* global FreeBlockEngine */

// Stress benchmark for large boards: measures first render, pan and drag
// frame rates so performance work has numbers instead of impressions.
// Open via the dev server: http://localhost:8123/benchmarks/stress.html
const { BlockEngine, BlockRenderer } = FreeBlockEngine;

const el = (id) => document.getElementById(id);
const results = el('results');

let engine = new BlockEngine();
let renderer = createRenderer();

function createRenderer() {
  return new BlockRenderer(engine, 'canvas', {
    cullOffscreen: el('cullToggle').checked,
    showMinimap: el('minimapToggle').checked,
    confirmDelete: false,
  });
}

function report(lines) {
  results.textContent = lines.join('\n');
}

/** Deterministic pseudo-random so runs are comparable. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function generate() {
  const count = Number(el('blockCount').value);
  const linksPerBlock = Number(el('linkRatio').value);
  const random = makeRandom(42);
  const columns = Math.ceil(Math.sqrt(count));

  renderer.destroy();
  engine = new BlockEngine();

  // Build the graph before the renderer exists: we want to time the first
  // full render, not the incremental per-block updates.
  const ids = [];
  for (let i = 0; i < count; i++) {
    const block = engine.createBlock(`Block ${i}\n\nGenerated for the stress benchmark.`, 'note', {
      x: (i % columns) * 320,
      y: Math.floor(i / columns) * 220,
    });
    ids.push(block.id);
  }
  let links = 0;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < linksPerBlock; k++) {
      const target = ids[Math.floor(random() * count)];
      if (target !== ids[i] && engine.linkBlocks(ids[i], target, k % 2 ? 'double' : 'single')) {
        links++;
      }
    }
  }
  engine.clearHistory();

  const started = performance.now();
  renderer = createRenderer();
  const renderMs = performance.now() - started;

  // Stay at 100% zoom: that is the working view, and the one where culling
  // matters. Use "Zoom to fit" for the overview case.
  renderer.resetView();
  report([
    `blocks:       ${count}`,
    `links:        ${links}`,
    `first render: ${renderMs.toFixed(1)} ms`,
    `on screen:    ${countVisible()}`,
  ]);
}

/** Blocks currently not culled. */
function countVisible() {
  return document.querySelectorAll('#canvas .block:not(.fbe-offscreen)').length;
}

/**
 * Run `step` on every animation frame for `durationMs` and return the
 * average frame rate.
 */
function measureFps(durationMs, step) {
  return new Promise((resolve) => {
    let frames = 0;
    const started = performance.now();
    const tick = (now) => {
      const elapsed = now - started;
      if (elapsed >= durationMs) {
        resolve((frames / elapsed) * 1000);
        return;
      }
      step(elapsed);
      frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function measurePan() {
  report(['panning…']);
  const start = { ...renderer.camera };
  const fps = await measureFps(2000, (elapsed) => {
    renderer.setCamera({
      x: start.x + Math.sin(elapsed / 200) * 600,
      y: start.y + Math.cos(elapsed / 200) * 400,
      zoom: start.zoom,
    });
  });
  renderer.setCamera(start);
  report([
    `pan:           ${fps.toFixed(1)} fps`,
    `cullOffscreen: ${renderer.options.cullOffscreen}`,
    `on screen:     ${countVisible()} / ${engine.getAllBlocks().length}`,
  ]);
}

async function measureDrag() {
  const blocks = engine.getAllBlocks();
  if (blocks.length === 0) {
    report(['generate a board first']);
    return;
  }
  report(['dragging…']);
  const target = blocks[Math.floor(blocks.length / 2)];
  renderer.selectBlock(target.id);
  const origin = { ...target.position };

  // Drive the same code path a real drag uses: gesture override + edge redraw.
  const fps = await measureFps(2000, (elapsed) => {
    const x = origin.x + Math.sin(elapsed / 150) * 300;
    const y = origin.y + Math.cos(elapsed / 150) * 200;
    renderer.setGestureOverride(target.id, { x, y });
    const node = renderer.getBlockElement(target.id);
    if (node) {
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    }
    renderer.connections.updateForBlock(target.id);
    renderer.minimap.update();
  });

  renderer.clearGestureOverride(target.id);
  renderer.syncBlockGeometry(target.id);
  report([
    `drag:          ${fps.toFixed(1)} fps`,
    `cullOffscreen: ${renderer.options.cullOffscreen}`,
    `on screen:     ${countVisible()} / ${engine.getAllBlocks().length}`,
  ]);
}

el('generateBtn').addEventListener('click', generate);
el('panBtn').addEventListener('click', measurePan);
el('dragBtn').addEventListener('click', measureDrag);
el('fitBtn').addEventListener('click', () => renderer.zoomToFit());
el('cullToggle').addEventListener('change', () => {
  renderer.setCullOffscreen(el('cullToggle').checked);
});
el('minimapToggle').addEventListener('change', () => {
  const camera = { ...renderer.camera };
  renderer.destroy();
  renderer = createRenderer();
  renderer.setCamera(camera);
});

// Exposed so the board can be driven from the console or an automated run.
window.bench = {
  get engine() {
    return engine;
  },
  get renderer() {
    return renderer;
  },
  generate,
  measurePan,
  measureDrag,
  countVisible,
};

generate();
