import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BlockEngine, BlockRenderer, DEFAULT_STRINGS, formatString } from '../src/index.js';

describe('formatString', () => {
  it('fills placeholders and leaves unknown ones alone', () => {
    expect(formatString('Delete {count} blocks?', { count: 3 })).toBe('Delete 3 blocks?');
    expect(formatString('{a} {b}', { a: 'x' })).toBe('x {b}');
    expect(formatString('plain')).toBe('plain');
  });
});

describe('BlockRenderer — strings and block chrome', () => {
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

  it('ships English defaults for everything the renderer shows', () => {
    const renderer = new BlockRenderer(engine, container);
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const el = renderer.getBlockElement(a.id);
    expect(el.querySelector('.block-content').dataset.placeholder).toBe(
      DEFAULT_STRINGS.contentPlaceholder
    );
    expect(el.querySelector('.block-action.links').title).toBe('Manage links');
    expect(renderer.t('confirmDeleteBlocks', { count: 4 })).toBe('Delete 4 blocks?');
    renderer.destroy();
  });

  it('lets the host translate the interface', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const renderer = new BlockRenderer(engine, container, {
      contextMenu: true,
      keyboardShortcuts: true,
      strings: {
        contentPlaceholder: 'Нажмите, чтобы редактировать',
        confirmDeleteBlock: 'Удалить блок?',
        confirmDeleteBlocks: 'Удалить блоки: {count}?',
        menuNewBlockHere: 'Новый блок здесь',
        linkEditorTitle: 'Связи',
        connections: 'Связи:',
      },
    });
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 400, y: 0 });
    engine.linkBlocks(a.id, b.id);
    const el = renderer.getBlockElement(a.id);
    expect(el.querySelector('.block-content').dataset.placeholder).toBe(
      'Нажмите, чтобы редактировать'
    );
    expect(el.querySelector('.block-links-label').textContent).toBe('Связи:');
    // Keys that were not overridden keep their default.
    expect(el.querySelector('.block-action.delete').title).toBe(DEFAULT_STRINGS.deleteBlock);

    renderer.deleteBlock(a.id);
    expect(confirm).toHaveBeenCalledWith('Удалить блок?');
    renderer.selectAll();
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(confirm).toHaveBeenCalledWith('Удалить блоки: 2?');
    expect(engine.getAllBlocks()).toHaveLength(2);

    container.dispatchEvent(
      new window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 50,
        clientY: 50,
      })
    );
    const labels = [...container.querySelectorAll('.fbe-context-item')].map(
      (item) => item.textContent
    );
    expect(labels).toContain('Новый блок здесь');
    expect(labels).toContain(DEFAULT_STRINGS.menuZoomToFit);
    renderer.contextMenu.close();

    renderer.openLinkEditor(a.id);
    expect(container.querySelector('.link-editor-popup h3').textContent).toBe('Связи');
    renderer.destroy();
    confirm.mockRestore();
  });

  it('can hide the id, the creation date and the connection chips', () => {
    const renderer = new BlockRenderer(engine, container, {
      showBlockId: false,
      showBlockMeta: false,
      showLinkChips: false,
    });
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 400, y: 0 });
    engine.linkBlocks(a.id, b.id);
    const el = renderer.getBlockElement(a.id);
    expect(el.querySelector('.block-id')).toBeNull();
    expect(el.querySelector('.block-metadata')).toBeNull();
    expect(el.querySelector('.block-links')).toBeNull();
    expect(el.querySelector('.block-content').textContent).toBe('a');
    expect(el.querySelector('.block-type').textContent).toBe('default');
    expect(container.querySelectorAll('.fbe-edge')).toHaveLength(1); // edges are unaffected
    renderer.destroy();

    // Everything is on by default.
    const plain = new BlockRenderer(engine, container);
    const el2 = plain.getBlockElement(a.id);
    expect(el2.querySelector('.block-id')).toBeTruthy();
    expect(el2.querySelector('.block-metadata')).toBeTruthy();
    expect(el2.querySelector('.block-links')).toBeTruthy();
    plain.destroy();
  });
});
