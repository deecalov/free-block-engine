import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockEngine, BlockRenderer } from '../src/index.js';

/** Let the rAF-throttled minimap render run. */
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Minimap', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('draws one node per block and marks the selection', async () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    engine.createBlock('b', 'default', { x: 800, y: 600 });
    await nextFrame();

    const minimap = container.querySelector('.minimap');
    expect(minimap.querySelectorAll('.minimap-block')).toHaveLength(2);
    expect(minimap.querySelectorAll('.minimap-block.selected')).toHaveLength(0);

    renderer.selectBlock(a.id);
    await nextFrame();
    expect(minimap.querySelectorAll('.minimap-block.selected')).toHaveLength(1);
  });

  it('keeps node count in sync when blocks are added and removed', async () => {
    const ids = [0, 1, 2].map(
      (i) => engine.createBlock(`b${i}`, 'default', { x: i * 300, y: 0 }).id
    );
    await nextFrame();
    const minimap = container.querySelector('.minimap');
    expect(minimap.querySelectorAll('.minimap-block')).toHaveLength(3);

    engine.deleteBlock(ids[0]);
    engine.deleteBlock(ids[1]);
    await nextFrame();
    expect(minimap.querySelectorAll('.minimap-block')).toHaveLength(1);
  });

  it('reuses the same nodes across frames instead of recreating them', async () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    engine.createBlock('b', 'default', { x: 600, y: 400 });
    await nextFrame();

    const minimap = container.querySelector('.minimap');
    const before = [...minimap.querySelectorAll('.minimap-block')];

    renderer.setCamera({ x: -100, y: -50, zoom: 1.5 });
    engine.setBlockPosition(a.id, 200, 200);
    await nextFrame();

    const after = [...minimap.querySelectorAll('.minimap-block')];
    expect(after).toEqual(before); // same node identities
    expect(after[0].style.left).not.toBe('');
  });

  it('hides itself without blocks and in grid mode', async () => {
    const minimap = container.querySelector('.minimap');
    await nextFrame();
    expect(minimap.style.display).toBe('none');

    engine.createBlock('a', 'default', { x: 0, y: 0 });
    await nextFrame();
    expect(minimap.style.display).toBe('');

    renderer.setViewMode('grid');
    await nextFrame();
    expect(minimap.style.display).toBe('none');
  });

  it('reflects the camera in the viewport rect', async () => {
    engine.createBlock('a', 'default', { x: 0, y: 0 });
    engine.createBlock('b', 'default', { x: 1200, y: 900 });
    await nextFrame();

    const viewportEl = container.querySelector('.minimap-viewport');
    const before = viewportEl.style.left;
    renderer.setCamera({ x: -400, y: -300, zoom: 1 });
    await nextFrame();
    expect(viewportEl.style.left).not.toBe(before);
  });

  it('navigates the camera on pointer drag', async () => {
    engine.createBlock('a', 'default', { x: 0, y: 0 });
    engine.createBlock('b', 'default', { x: 1200, y: 900 });
    await nextFrame();

    const minimap = container.querySelector('.minimap');
    const before = { ...renderer.camera };
    const press = (type, clientX, clientY) =>
      minimap.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          pointerId: 3,
        })
      );

    press('pointerdown', 120, 90);
    press('pointermove', 150, 110);
    press('pointerup', 150, 110);
    expect(renderer.camera).not.toEqual(before);

    // After release the map no longer follows the pointer.
    const settled = { ...renderer.camera };
    press('pointermove', 20, 20);
    expect(renderer.camera).toEqual(settled);
  });

  it('is not mounted when showMinimap is false', () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherRenderer = new BlockRenderer(new BlockEngine(), other, { showMinimap: false });
    expect(other.querySelector('.minimap')).toBeNull();
    otherRenderer.destroy();
    other.remove();
  });
});
