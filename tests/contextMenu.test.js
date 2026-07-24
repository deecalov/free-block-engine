import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockEngine, BlockRenderer } from '../src/index.js';

describe('ContextMenu', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  const rightClick = (target, opts = {}) =>
    target.dispatchEvent(
      new window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
        ...opts,
      })
    );

  const labels = () =>
    [...container.querySelectorAll('.fbe-context-item')].map((el) => el.textContent);

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container, { contextMenu: true, confirmDelete: false });
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('opens canvas actions on the empty canvas', () => {
    rightClick(container);
    expect(container.querySelector('.fbe-context-menu')).toBeTruthy();
    expect(labels()).toContain('New block here');
    expect(labels()).toContain('Zoom to fit');
  });

  it('opens block actions over a block and runs them', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    rightClick(renderer.getBlockElement(a.id));
    expect(labels()).toContain('Duplicate');

    const duplicate = [...container.querySelectorAll('.fbe-context-item')].find(
      (el) => el.textContent === 'Duplicate'
    );
    duplicate.click();
    expect(engine.getAllBlocks()).toHaveLength(2);
    expect(container.querySelector('.fbe-context-menu')).toBeNull(); // closes on activation
  });

  it('creates a block at the clicked world position', () => {
    renderer.setCamera({ x: 0, y: 0, zoom: 1 });
    rightClick(container, { clientX: 240, clientY: 160 });
    const create = [...container.querySelectorAll('.fbe-context-item')].find(
      (el) => el.textContent === 'New block here'
    );
    create.click();

    const [block] = engine.getAllBlocks();
    expect(block.position).toEqual({ x: 240, y: 160 });
  });

  it('hides mutating actions in read-only mode', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    renderer.setReadOnly(true);

    rightClick(renderer.getBlockElement(a.id));
    expect(labels()).not.toContain('Duplicate');
    expect(labels()).not.toContain('Delete');
    expect(labels()).toContain('Bring to front');
  });

  it('is keyboard operable and closes on Escape', () => {
    rightClick(container);
    const menu = container.querySelector('.fbe-context-menu');
    const items = [...menu.querySelectorAll('.fbe-context-item')];
    expect(document.activeElement).toBe(items[0]);

    const press = (key) =>
      menu.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

    press('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    press('ArrowUp');
    expect(document.activeElement).toBe(items[0]);
    press('ArrowUp'); // wraps to the end
    expect(document.activeElement).toBe(items[items.length - 1]);
    press('Home');
    expect(document.activeElement).toBe(items[0]);
    press('End');
    expect(document.activeElement).toBe(items[items.length - 1]);

    press('Escape');
    expect(container.querySelector('.fbe-context-menu')).toBeNull();
  });

  it('carries menu ARIA roles', () => {
    rightClick(container);
    const menu = container.querySelector('.fbe-context-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.querySelector('.fbe-context-item').getAttribute('role')).toBe('menuitem');
    expect(menu.querySelector('.fbe-context-separator').getAttribute('role')).toBe('separator');
  });

  it('lets the host replace the items', () => {
    const seen = [];
    renderer.options.contextMenuItems = (target, defaults) => {
      seen.push({ type: target.type, defaults: defaults.length });
      return [{ label: 'Only mine', action: () => {} }];
    };
    rightClick(container);
    expect(labels()).toEqual(['Only mine']);
    expect(seen[0].type).toBe('canvas');
    expect(seen[0].defaults).toBeGreaterThan(0);
  });

  it('survives a throwing items hook', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderer.options.contextMenuItems = () => {
      throw new Error('boom');
    };
    rightClick(container);
    expect(container.querySelector('.fbe-context-menu')).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('opens on a touch long-press and is cancelled by movement', () => {
    const touch = (type, opts) =>
      container.dispatchEvent(
        new window.PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'touch',
          clientX: 50,
          clientY: 50,
          ...opts,
        })
      );

    touch('pointerdown');
    vi.advanceTimersByTime(600);
    expect(container.querySelector('.fbe-context-menu')).toBeTruthy();
    touch('pointerup');

    container.querySelector('.fbe-context-menu')?.remove();
    renderer.contextMenu.close();

    // A finger that travels is panning, not holding.
    touch('pointerdown');
    touch('pointermove', { clientX: 200, clientY: 200 });
    vi.advanceTimersByTime(600);
    expect(container.querySelector('.fbe-context-menu')).toBeNull();
    touch('pointerup', { clientX: 200, clientY: 200 });
  });

  it('does nothing when the option is off', () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherRenderer = new BlockRenderer(new BlockEngine(), other);
    const event = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    other.dispatchEvent(event);

    expect(other.querySelector('.fbe-context-menu')).toBeNull();
    expect(event.defaultPrevented).toBe(false); // native menu still available
    otherRenderer.destroy();
    other.remove();
  });
});
