import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockEngine, BlockRenderer, findAlignment } from '../src/index.js';

const rect = (x, y, width = 100, height = 100) => ({ x, y, width, height });

describe('findAlignment', () => {
  it('returns no correction without candidates or with a zero threshold', () => {
    expect(findAlignment(rect(0, 0), [], 6)).toMatchObject({ dx: 0, dy: 0 });
    expect(findAlignment(rect(0, 0), [rect(3, 3)], 0)).toMatchObject({ dx: 0, dy: 0 });
  });

  it('snaps left edges that are within the threshold', () => {
    const alignment = findAlignment(rect(104, 500), [rect(100, 0)], 6);
    expect(alignment.dx).toBe(-4);
    expect(alignment.dy).toBe(0);
    expect(alignment.vertical[0].position).toBe(100);
  });

  it('ignores neighbours further away than the threshold', () => {
    expect(findAlignment(rect(120, 500), [rect(100, 0)], 6)).toMatchObject({ dx: 0, dy: 0 });
  });

  it('aligns centers as well as edges', () => {
    // Moving center is 100 + 50 = 150; target center is 148.
    const alignment = findAlignment(rect(100, 0), [rect(98, 400)], 6);
    expect(alignment.dx).toBe(-2);
  });

  it('resolves both axes independently, possibly against different blocks', () => {
    const alignment = findAlignment(rect(103, 207), [rect(100, 900), rect(900, 210)], 6);
    expect(alignment.dx).toBe(-3);
    expect(alignment.dy).toBe(3);
    expect(alignment.vertical).toHaveLength(1);
    expect(alignment.horizontal).toHaveLength(1);
  });

  it('prefers the closest anchor', () => {
    // Right edge (200) is 2 away from 202; left edge (100) is 5 away from 105.
    const alignment = findAlignment(rect(100, 0), [rect(202, 500), rect(105, 700)], 6);
    expect(alignment.dx).toBe(2);
  });

  it('stretches the guide across the blocks it connects', () => {
    const alignment = findAlignment(rect(104, 500), [rect(100, 0)], 6);
    const guide = alignment.vertical[0];
    expect(guide.from).toBe(0); // top of the neighbour
    expect(guide.to).toBe(600); // bottom of the dragged block
  });
});

describe('BlockRenderer — snap guides during drag', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  function pointer(target, type, opts) {
    target.dispatchEvent(
      new window.PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        ...opts,
      })
    );
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container, { snapGuides: true, snapThreshold: 8 });
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('snaps to a neighbour and commits without grid rounding', () => {
    // The anchor sits off-grid on purpose: grid snapping would break alignment.
    const anchor = engine.createBlock('anchor', 'default', { x: 0, y: 0 });
    engine.setBlockPosition(anchor.id, 313, 0, false);
    const moving = engine.createBlock('moving', 'default', { x: 0, y: 600 });

    const el = renderer.getBlockElement(moving.id);
    pointer(el, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(container, 'pointermove', { clientX: 316, clientY: 0 });
    pointer(container, 'pointerup', { clientX: 316, clientY: 0 });

    expect(moving.position.x).toBe(313); // aligned, not rounded to 320
    expect(container.querySelector('.fbe-guide')).toBeNull(); // guides cleared
  });

  it('shows a guide line while dragging and hides it on release', () => {
    const anchor = engine.createBlock('anchor', 'default', { x: 0, y: 0 });
    engine.setBlockPosition(anchor.id, 313, 0, false);
    const moving = engine.createBlock('moving', 'default', { x: 0, y: 600 });

    const el = renderer.getBlockElement(moving.id);
    pointer(el, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(container, 'pointermove', { clientX: 316, clientY: 0 });

    const guide = container.querySelector('.fbe-guide-vertical');
    expect(guide).toBeTruthy();
    expect(guide.style.left).toBe('313px');

    pointer(container, 'pointerup', { clientX: 316, clientY: 0 });
    expect(container.querySelector('.fbe-guides')).toBeNull();
  });

  it('still snaps to the grid when nothing is nearby', () => {
    const moving = engine.createBlock('moving', 'default', { x: 0, y: 0 });
    const el = renderer.getBlockElement(moving.id);

    pointer(el, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(container, 'pointermove', { clientX: 113, clientY: 0 });
    pointer(container, 'pointerup', { clientX: 113, clientY: 0 });

    expect(moving.position.x).toBe(120); // grid step 20
  });

  it('does nothing when the option is off', () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherEngine = new BlockEngine();
    const otherRenderer = new BlockRenderer(otherEngine, other);
    const anchor = otherEngine.createBlock('anchor', 'default', { x: 0, y: 0 });
    otherEngine.setBlockPosition(anchor.id, 313, 0, false);
    const moving = otherEngine.createBlock('moving', 'default', { x: 0, y: 600 });

    const el = otherRenderer.getBlockElement(moving.id);
    pointer(el, 'pointerdown', { clientX: 0, clientY: 0 });
    pointer(other, 'pointermove', { clientX: 316, clientY: 0 });
    expect(other.querySelector('.fbe-guide')).toBeNull();
    pointer(other, 'pointerup', { clientX: 316, clientY: 0 });

    expect(moving.position.x).toBe(320); // plain grid snapping
    otherRenderer.destroy();
    other.remove();
  });
});
