import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockEngine, BlockRenderer } from '../src/index.js';

/** Dispatch a bubbling pointer event on a target. */
function pointer(target, type, opts = {}) {
  target.dispatchEvent(
    new window.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      ...opts,
    })
  );
}

describe('BlockRenderer', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'canvas';
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('renders blocks and updates incrementally without rebuilding other elements', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const elA = renderer.getBlockElement(a.id);
    expect(elA).toBeTruthy();

    const b = engine.createBlock('b', 'default', { x: 500, y: 100 });
    expect(renderer.getBlockElement(a.id)).toBe(elA); // same node, no full re-render
    expect(container.querySelectorAll('.block')).toHaveLength(2);

    engine.deleteBlock(b.id);
    expect(container.querySelectorAll('.block')).toHaveLength(1);
    expect(renderer.getBlockElement(b.id)).toBeNull();
  });

  it('applies model position and size to the element', () => {
    const a = engine.createBlock('a', 'default', { x: 120, y: 80 }, { width: 300, height: 200 });
    const el = renderer.getBlockElement(a.id);
    expect(el.style.left).toBe('120px');
    expect(el.style.top).toBe('80px');
    expect(el.style.width).toBe('300px');
    expect(el.style.height).toBe('200px');
    engine.setBlockPosition(a.id, 200, 200);
    expect(el.style.left).toBe('200px');
  });

  it('selects on click and toggles with ctrl-click', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 500, y: 100 });
    const elA = renderer.getBlockElement(a.id);
    const elB = renderer.getBlockElement(b.id);

    pointer(elA, 'pointerdown', { clientX: 110, clientY: 110 });
    pointer(elA, 'pointerup', { clientX: 110, clientY: 110 });
    expect(elA.classList.contains('selected')).toBe(true);

    pointer(elB, 'pointerdown', { clientX: 510, clientY: 110, ctrlKey: true });
    pointer(elB, 'pointerup', { clientX: 510, clientY: 110, ctrlKey: true });
    expect(renderer.selectedBlocks.size).toBe(2);

    // plain click on A keeps it as the sole selection (no toggle-off)
    pointer(elA, 'pointerdown', { clientX: 110, clientY: 110 });
    pointer(elA, 'pointerup', { clientX: 110, clientY: 110 });
    expect(renderer.selectedBlocks.size).toBe(1);
    expect(renderer.selectedBlocks.has(a.id)).toBe(true);
  });

  it('drags a block and commits the snapped position on release', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const el = renderer.getBlockElement(a.id);

    pointer(el, 'pointerdown', { clientX: 110, clientY: 110 });
    pointer(container, 'pointermove', { clientX: 173, clientY: 152 });
    pointer(container, 'pointerup', { clientX: 173, clientY: 152 });

    expect(a.position).toEqual({ x: 160, y: 140 }); // +63/+42 snapped to grid 20
    expect(el.style.left).toBe('160px');
  });

  it('does not treat a sub-threshold move as a drag', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const el = renderer.getBlockElement(a.id);
    pointer(el, 'pointerdown', { clientX: 110, clientY: 110 });
    pointer(container, 'pointermove', { clientX: 112, clientY: 111 });
    pointer(container, 'pointerup', { clientX: 112, clientY: 111 });
    expect(a.position).toEqual({ x: 100, y: 100 });
    expect(renderer.selectedBlocks.has(a.id)).toBe(true); // treated as click
  });

  it('lasso-selects blocks on empty canvas drag', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 800, y: 600 });

    pointer(container, 'pointerdown', { clientX: 50, clientY: 50 });
    pointer(container, 'pointermove', { clientX: 400, clientY: 300 });
    pointer(container, 'pointerup', { clientX: 400, clientY: 300 });

    expect(renderer.selectedBlocks.has(a.id)).toBe(true);
    expect(renderer.selectedBlocks.has(b.id)).toBe(false);
  });

  it('clears selection on empty-canvas click and on Escape', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);
    pointer(container, 'pointerdown', { clientX: 700, clientY: 500 });
    pointer(container, 'pointerup', { clientX: 700, clientY: 500 });
    expect(renderer.selectedBlocks.size).toBe(0);

    renderer.selectBlock(a.id);
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(renderer.selectedBlocks.size).toBe(0);
  });

  it('updates the engine when block content is edited', () => {
    const a = engine.createBlock('old', 'default', { x: 100, y: 100 });
    const contentEl = renderer.getBlockElement(a.id).querySelector('.block-content');
    contentEl.textContent = 'new text';
    contentEl.dispatchEvent(new window.Event('blur'));
    expect(engine.getBlock(a.id).content).toBe('new text');
  });

  it('draws edges with arrow markers and labels', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 100 });
    engine.linkBlocks(a.id, b.id, 'single', 'my label');

    const edge = container.querySelector('.fbe-edge');
    expect(edge).toBeTruthy();
    expect(edge.dataset.type).toBe('single');
    const path = edge.querySelector('.edge-path');
    expect(path.getAttribute('marker-end')).toContain('fbe-arrow-single');
    expect(path.getAttribute('marker-start')).toBeNull();
    expect(edge.querySelector('.edge-label').textContent).toBe('my label');
    expect(edge.querySelector('.edge-dot')).toBeTruthy();

    engine.updateLinkType(a.id, b.id, 'double');
    const doubleEdge = container.querySelector('.fbe-edge');
    expect(doubleEdge.dataset.type).toBe('double');
    const doublePath = doubleEdge.querySelector('.edge-path');
    expect(doublePath.getAttribute('marker-start')).toContain('fbe-arrow-double');
  });

  it('produces finite path coordinates even for overlapping blocks', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 100, y: 100 });
    engine.linkBlocks(a.id, b.id, 'single');
    const d = container.querySelector('.fbe-edge .edge-path').getAttribute('d');
    expect(d).not.toContain('NaN');
  });

  it('opens the edge editor when a connection is clicked', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 100 });
    engine.linkBlocks(a.id, b.id, 'single');

    const hit = container.querySelector('.fbe-edge .edge-hit');
    hit.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 150 })
    );
    expect(container.querySelector('.link-editor-popup')).toBeTruthy();
  });

  it('opens the block link editor via the links action', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 100 });
    engine.linkBlocks(a.id, b.id, 'single');
    renderer.openLinkEditor(a.id);
    const popup = container.querySelector('.link-editor-popup');
    expect(popup).toBeTruthy();
    expect(popup.querySelectorAll('.link-editor-item')).toHaveLength(1);
    expect(popup.querySelector('.link-editor-label')).toBeTruthy();
  });

  it('supports zoom with correct world/screen math', () => {
    renderer.setZoom(2);
    expect(renderer.camera.zoom).toBe(2);
    expect(renderer.viewport.style.transform).toContain('scale(2)');

    const world = { x: 123, y: 45 };
    const screen = renderer.worldToScreen(world);
    const roundtrip = renderer.screenToWorld(screen.x, screen.y);
    expect(roundtrip.x).toBeCloseTo(world.x);
    expect(roundtrip.y).toBeCloseTo(world.y);

    renderer.setZoom(100);
    expect(renderer.camera.zoom).toBe(renderer.options.maxZoom);
  });

  it('read-only mode disables editing affordances', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.setReadOnly(true);
    const el = renderer.getBlockElement(a.id);
    expect(el.querySelector('.resize-handle')).toBeNull();
    expect(el.querySelector('.block-content').getAttribute('contenteditable')).not.toBe('true');
    renderer.deleteBlock(a.id);
    expect(engine.getBlock(a.id)).toBeTruthy(); // delete is a no-op

    renderer.setReadOnly(false);
    expect(renderer.getBlockElement(a.id).querySelector('.resize-handle')).toBeTruthy();
  });

  it('duplicateSelected copies blocks and selects the copies', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);
    const copies = renderer.duplicateSelected();
    expect(copies).toHaveLength(1);
    expect(engine.getAllBlocks()).toHaveLength(2);
    expect(renderer.selectedBlocks.has(copies[0].id)).toBe(true);
    engine.undo(); // one undo step removes the duplicate
    expect(engine.getAllBlocks()).toHaveLength(1);
  });

  it('linkSelected chains blocks and returns false for fewer than two', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 400, y: 0 });
    renderer.selectBlock(a.id);
    expect(renderer.linkSelected()).toBe(false);
    renderer.selectBlock(b.id, true);
    expect(renderer.linkSelected('double')).toBe(true);
    expect(engine.getLinkInfo(a.id, b.id).type).toBe('double');
  });

  it('linking mode connects source to the clicked block', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 100 });
    renderer.setDefaultLinkType('double');
    renderer.startLinkingMode(a.id);
    expect(container.classList.contains('linking')).toBe(true);

    pointer(renderer.getBlockElement(b.id), 'pointerdown', { clientX: 610, clientY: 110 });
    expect(engine.getLinkInfo(a.id, b.id).type).toBe('double');
    expect(container.classList.contains('linking')).toBe(false);
  });

  it('supports two independent renderer instances on one page', () => {
    const otherContainer = document.createElement('div');
    document.body.appendChild(otherContainer);
    const otherEngine = new BlockEngine();
    const otherRenderer = new BlockRenderer(otherEngine, otherContainer);

    engine.createBlock('mine', 'default', { x: 0, y: 0 });
    otherEngine.createBlock('theirs 1', 'default', { x: 0, y: 0 });
    otherEngine.createBlock('theirs 2', 'default', { x: 400, y: 0 });

    expect(container.querySelectorAll('.block')).toHaveLength(1);
    expect(otherContainer.querySelectorAll('.block')).toHaveLength(2);
    expect(container.querySelectorAll('.minimap')).toHaveLength(1);
    expect(otherContainer.querySelectorAll('.minimap')).toHaveLength(1);

    otherRenderer.destroy();
    otherContainer.remove();
    expect(container.querySelectorAll('.block')).toHaveLength(1);
  });

  it('destroy() removes all DOM and detaches engine listeners', () => {
    engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.destroy();
    expect(container.querySelector('.block')).toBeNull();
    expect(container.querySelector('.minimap')).toBeNull();
    expect(container.classList.contains('blocks-container')).toBe(false);

    // Engine keeps working and does not touch the dead renderer.
    const b = engine.createBlock('after destroy');
    expect(engine.getBlock(b.id)).toBeTruthy();
    expect(container.querySelector('.block')).toBeNull();

    // Global listeners are gone: key events no longer reach the renderer.
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  });

  it('grid mode hides free-positioning affordances', () => {
    engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.setViewMode('grid');
    expect(container.classList.contains('grid-mode')).toBe(true);
    expect(container.querySelector('.resize-handle')).toBeNull();
    renderer.setViewMode('free');
    expect(container.classList.contains('grid-mode')).toBe(false);
    expect(container.querySelector('.resize-handle')).toBeTruthy();
  });
});

describe('BlockRenderer — keyboard shortcuts', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  /** Dispatch a keydown on window (the target browsers use is body/window). */
  function key(opts) {
    window.dispatchEvent(
      new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts })
    );
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container, {
      keyboardShortcuts: true,
      confirmDelete: false,
    });
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('undoes and redoes with Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z', () => {
    const a = engine.createBlock('a');
    key({ key: 'z', ctrlKey: true });
    expect(engine.getBlock(a.id)).toBeNull();
    key({ key: 'y', ctrlKey: true });
    expect(engine.getBlock(a.id)).toBeTruthy();
    key({ key: 'z', ctrlKey: true });
    expect(engine.getBlock(a.id)).toBeNull();
    key({ key: 'Z', ctrlKey: true, shiftKey: true }); // browsers report uppercase with Shift
    expect(engine.getBlock(a.id)).toBeTruthy();
  });

  it('selects all with Ctrl+A', () => {
    engine.createBlock('a');
    engine.createBlock('b');
    key({ key: 'a', ctrlKey: true });
    expect(renderer.selectedBlocks.size).toBe(2);
  });

  it('duplicates the selection with Ctrl+D', () => {
    const a = engine.createBlock('a');
    renderer.selectBlock(a.id);
    key({ key: 'd', ctrlKey: true });
    expect(engine.getAllBlocks()).toHaveLength(2);
  });

  it('deletes the selection with Delete, honouring confirmDelete', () => {
    const a = engine.createBlock('a');
    renderer.selectBlock(a.id);
    key({ key: 'Delete' });
    expect(engine.getBlock(a.id)).toBeNull();

    renderer.options.confirmDelete = true;
    const b = engine.createBlock('b');
    renderer.selectBlock(b.id);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    key({ key: 'Delete' });
    expect(engine.getBlock(b.id)).toBeTruthy(); // declined confirmation
    confirmSpy.mockRestore();
  });

  it('nudges the selection with arrow keys (Shift = 1px without snapping)', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);
    key({ key: 'ArrowRight' });
    expect(a.position).toEqual({ x: 120, y: 100 }); // gridSize step
    key({ key: 'ArrowDown', shiftKey: true });
    expect(a.position).toEqual({ x: 120, y: 101 });
  });

  it('nudges multiple selected blocks as one undo step', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 400, y: 100 });
    renderer.selectAll();
    key({ key: 'ArrowDown' });
    expect(a.position.y).toBe(120);
    expect(b.position.y).toBe(120);
    engine.undo();
    expect(engine.getBlock(a.id).position.y).toBe(100);
    expect(engine.getBlock(b.id).position.y).toBe(100);
  });

  it('ignores shortcuts while typing in an editable element', () => {
    const a = engine.createBlock('a');
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })
    );
    expect(engine.getBlock(a.id)).toBeTruthy();
    input.remove();
  });

  it('blocks mutating shortcuts in read-only mode but keeps Ctrl+A', () => {
    const a = engine.createBlock('a');
    renderer.setReadOnly(true);
    key({ key: 'z', ctrlKey: true });
    expect(engine.getBlock(a.id)).toBeTruthy(); // undo suppressed
    key({ key: 'a', ctrlKey: true });
    expect(renderer.selectedBlocks.size).toBe(1);
  });

  it('does nothing when the option is disabled', () => {
    const otherContainer = document.createElement('div');
    document.body.appendChild(otherContainer);
    const otherEngine = new BlockEngine();
    const otherRenderer = new BlockRenderer(otherEngine, otherContainer);
    const a = otherEngine.createBlock('a');
    key({ key: 'z', ctrlKey: true });
    expect(otherEngine.getBlock(a.id)).toBeTruthy();
    otherRenderer.destroy();
    otherContainer.remove();
  });
});

describe('BlockRenderer — custom content hook', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {HTMLElement} */
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lets the host render content and disables inline editing', () => {
    const hook = vi.fn((block, element) => {
      element.textContent = '';
      const strong = element.ownerDocument.createElement('strong');
      strong.dataset.custom = 'yes';
      strong.textContent = block.content.toUpperCase();
      element.appendChild(strong);
      return true;
    });
    const renderer = new BlockRenderer(engine, container, { renderContent: hook });
    const a = engine.createBlock('hello', 'note');
    const contentEl = renderer.getBlockElement(a.id).querySelector('.block-content');
    expect(contentEl.querySelector('[data-custom]').textContent).toBe('HELLO');
    expect(contentEl.contentEditable).not.toBe('true');
    expect(hook).toHaveBeenCalledWith(a, contentEl, { readOnly: false });

    engine.setBlockContent(a.id, 'updated');
    expect(hook).toHaveBeenCalledTimes(2);
    expect(contentEl.querySelector('[data-custom]').textContent).toBe('UPDATED');
    renderer.destroy();
  });

  it('falls back to plain text when the hook declines or throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let mode = 'decline';
    const renderer = new BlockRenderer(engine, container, {
      renderContent: () => {
        if (mode === 'throw') throw new Error('boom');
        return false;
      },
    });
    const a = engine.createBlock('plain text');
    const contentEl = renderer.getBlockElement(a.id).querySelector('.block-content');
    expect(contentEl.textContent).toBe('plain text');
    expect(contentEl.contentEditable).toBe('true');

    mode = 'throw';
    engine.setBlockContent(a.id, 'still plain');
    expect(contentEl.textContent).toBe('still plain');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
    renderer.destroy();
  });
});
