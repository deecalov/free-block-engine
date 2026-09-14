import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

/** A clipboard event with an in-memory DataTransfer stand-in (jsdom has none). */
function clipboardEvent(type, data = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  const store = { ...data };
  event.clipboardData = {
    getData: (mime) => store[mime] ?? '',
    setData: (mime, value) => {
      store[mime] = value;
    },
  };
  event.store = store;
  return event;
}

describe('BlockRenderer — selection modifiers and double-click', () => {
  let engine;
  let renderer;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container, { confirmDelete: false });
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('extends the selection with Shift+click like Ctrl+click', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 500, y: 100 });
    const elA = renderer.getBlockElement(a.id);
    const elB = renderer.getBlockElement(b.id);

    pointer(elA, 'pointerdown', { clientX: 110, clientY: 110 });
    pointer(elA, 'pointerup', { clientX: 110, clientY: 110 });
    pointer(elB, 'pointerdown', { clientX: 510, clientY: 110, shiftKey: true });
    pointer(elB, 'pointerup', { clientX: 510, clientY: 110, shiftKey: true });
    expect(renderer.selectedBlocks.size).toBe(2);

    // Shift+click toggles a selected block off again.
    pointer(elA, 'pointerdown', { clientX: 110, clientY: 110, shiftKey: true });
    pointer(elA, 'pointerup', { clientX: 110, clientY: 110, shiftKey: true });
    expect([...renderer.selectedBlocks]).toEqual([b.id]);
  });

  it('creates and selects a block on canvas double-click', () => {
    container.dispatchEvent(
      new window.MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 200,
      })
    );
    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].position).toEqual({ x: 300, y: 200 });
    expect(renderer.selectedBlocks.has(blocks[0].id)).toBe(true);
  });

  it('ignores double-clicks on blocks and in read-only mode', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer
      .getBlockElement(a.id)
      .dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(engine.getAllBlocks()).toHaveLength(1);

    renderer.setReadOnly(true);
    container.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(engine.getAllBlocks()).toHaveLength(1);
  });
});

describe('BlockRenderer — clipboard', () => {
  let engine;
  let renderer;
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    // A measurable viewport so paste can decide between "next to the originals" and "centered".
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
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

  it('copies the selection as a fragment and pastes it next to the originals', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 400, y: 100 });
    engine.linkBlocks(a.id, b.id, 'single', 'ab');
    renderer.selectAll();

    const copy = clipboardEvent('copy');
    window.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    const fragment = JSON.parse(copy.store['text/plain']);
    expect(fragment.blocks).toHaveLength(2);

    const paste = clipboardEvent('paste', { 'text/plain': copy.store['text/plain'] });
    window.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(engine.getAllBlocks()).toHaveLength(4);
    const copies = renderer.getSelectedBlocks();
    expect(copies).toHaveLength(2);
    expect(copies.map((block) => block.id)).not.toContain(a.id);
    expect(copies[0].position).toEqual({ x: 140, y: 140 }); // two grid steps away
    expect(engine.getLinkInfo(copies[0].id, copies[1].id).label).toBe('ab');

    engine.undo(); // the paste is one step
    expect(engine.getAllBlocks()).toHaveLength(2);
  });

  it('centers a pasted fragment whose originals are out of view', () => {
    const fragment = JSON.stringify({
      blocks: [{ id: 'far', content: 'far', position: { x: 5000, y: 5000 } }],
    });
    const paste = clipboardEvent('paste', { 'text/plain': fragment });
    window.dispatchEvent(paste);
    const [block] = engine.getAllBlocks();
    // The view is 800x600 at the origin; the 250x150 block lands in its middle.
    expect(block.position).toEqual({ x: 280, y: 220 });
  });

  it('pastes plain text as a new block in the middle of the view', () => {
    const paste = clipboardEvent('paste', { 'text/plain': 'hello there' });
    window.dispatchEvent(paste);
    const [block] = engine.getAllBlocks();
    expect(block.content).toBe('hello there');
    expect(block.position).toEqual({ x: 280, y: 220 });
    expect(renderer.selectedBlocks.has(block.id)).toBe(true);
  });

  it('cuts the selection after copying it', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);
    const cut = clipboardEvent('cut');
    window.dispatchEvent(cut);
    expect(JSON.parse(cut.store['text/plain']).blocks[0].id).toBe(a.id);
    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('leaves the clipboard alone without a selection, while typing or with text selected', () => {
    const untouched = clipboardEvent('copy');
    window.dispatchEvent(untouched);
    expect(untouched.defaultPrevented).toBe(false);

    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);

    const input = document.createElement('input');
    document.body.appendChild(input);
    const typing = clipboardEvent('copy');
    input.dispatchEvent(typing);
    expect(typing.defaultPrevented).toBe(false);

    const text = document.createElement('p');
    text.textContent = 'page text';
    document.body.appendChild(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const withTextSelection = clipboardEvent('copy');
    window.dispatchEvent(withTextSelection);
    expect(withTextSelection.defaultPrevented).toBe(false);
    selection.removeAllRanges();

    const pasteWhileTyping = clipboardEvent('paste', { 'text/plain': 'x' });
    input.dispatchEvent(pasteWhileTyping);
    expect(engine.getAllBlocks()).toHaveLength(1);
  });

  it('does nothing in read-only mode or when shortcuts are off', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    renderer.selectBlock(a.id);
    renderer.setReadOnly(true);
    const paste = clipboardEvent('paste', { 'text/plain': 'x' });
    window.dispatchEvent(paste);
    expect(engine.getAllBlocks()).toHaveLength(1);
    expect(renderer.paste('x')).toEqual([]);

    renderer.setReadOnly(false);
    renderer.options.keyboardShortcuts = false;
    const copy = clipboardEvent('copy');
    window.dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(false);
  });
});

describe('BlockRenderer — resize from every side', () => {
  let engine;
  let renderer;
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

  const resize = (block, dir, dx, dy) => {
    renderer.selectBlock(block.id); // handles are created for hovered/selected blocks
    const handle = renderer.getBlockElement(block.id).querySelector(`.resize-handle-${dir}`);
    pointer(handle, 'pointerdown', { clientX: 500, clientY: 500 });
    pointer(container, 'pointermove', { clientX: 500 + dx, clientY: 500 + dy });
    pointer(container, 'pointerup', { clientX: 500 + dx, clientY: 500 + dy });
  };

  it('creates the eight handles lazily, for hovered and selected blocks only', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    const b = engine.createBlock('b', 'default', { x: 500, y: 100 });
    const handles = (block) =>
      renderer.getBlockElement(block.id).querySelectorAll('.resize-handle').length;
    expect(handles(a)).toBe(0);
    expect(handles(b)).toBe(0);

    renderer.selectBlock(a.id);
    expect(handles(a)).toBe(8);

    pointer(renderer.getBlockElement(b.id).querySelector('.block-content'), 'pointerover');
    expect(handles(b)).toBe(8);
    pointer(renderer.getBlockElement(b.id), 'pointerover');
    expect(handles(b)).toBe(8); // not duplicated
  });

  it('keeps the right edge in place when dragging the left handle', () => {
    const a = engine.createBlock('a', 'default', { x: 300, y: 100 }, { width: 300, height: 200 });
    resize(a, 'left', -50, 0);
    expect(a.size.width).toBe(350);
    expect(a.position.x).toBe(250);
    expect(a.position.y).toBe(100);
    engine.undo(); // move + resize form one step
    expect(a.size.width).toBe(300);
    expect(a.position.x).toBe(300);
  });

  it('resizes from the top-left corner and respects the minimum size', () => {
    const a = engine.createBlock('a', 'default', { x: 300, y: 300 }, { width: 300, height: 200 });
    resize(a, 'top-left', 500, 500); // far beyond the minimum
    expect(a.size).toEqual({ width: 150, height: 100 });
    // The bottom-right corner stayed at (600, 500).
    expect(a.position).toEqual({ x: 450, y: 400 });
  });

  it('still grows from the bottom-right corner without moving the block', () => {
    const a = engine.createBlock('a', 'default', { x: 100, y: 100 });
    resize(a, 'corner', 40, 30);
    expect(a.size).toEqual({ width: 290, height: 180 });
    expect(a.position).toEqual({ x: 100, y: 100 });
  });
});
