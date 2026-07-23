import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockEngine, DEFAULT_BLOCK_SIZE } from '../src/index.js';

describe('BlockEngine — blocks', () => {
  /** @type {BlockEngine} */
  let engine;

  beforeEach(() => {
    engine = new BlockEngine();
  });

  it('creates a block with the default 250x150 size', () => {
    const block = engine.createBlock('Hello');
    expect(block.size).toEqual({ width: 250, height: 150 });
    expect(block.size).toEqual({ ...DEFAULT_BLOCK_SIZE });
  });

  it('generates unique prefixed ids', () => {
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(engine.generateId());
    }
    expect(ids.size).toBe(1000);
    for (const id of ids) {
      expect(id.startsWith('block_')).toBe(true);
    }
  });

  it('auto-positions new blocks to the right of the rightmost block', () => {
    const first = engine.createBlock('a');
    expect(first.position).toEqual({ x: 50, y: 50 });
    const second = engine.createBlock('b');
    expect(second.position.x).toBe(50 + engine.settings.defaultSpacing);
  });

  it('snaps positions to the grid', () => {
    const block = engine.createBlock('a');
    engine.setBlockPosition(block.id, 113, 87);
    expect(block.position).toEqual({ x: 120, y: 80 });
  });

  it('enforces minimum size', () => {
    const block = engine.createBlock('a');
    engine.setBlockSize(block.id, 10, 10);
    expect(block.size).toEqual({
      width: engine.settings.minBlockWidth,
      height: engine.settings.minBlockHeight,
    });
  });

  it('deletes a block and removes links pointing to it', () => {
    const a = engine.createBlock('a');
    const b = engine.createBlock('b');
    engine.linkBlocks(a.id, b.id, 'single');
    expect(engine.deleteBlock(b.id)).toBe(true);
    expect(engine.getBlock(b.id)).toBeNull();
    expect(a.hasLink(b.id)).toBe(false);
  });

  it('reports affected neighbours in the blockDeleted event', () => {
    const a = engine.createBlock('a');
    const b = engine.createBlock('b');
    const c = engine.createBlock('c');
    engine.linkBlocks(a.id, b.id, 'single'); // a -> b
    engine.linkBlocks(b.id, c.id, 'single'); // b -> c
    const seen = vi.fn();
    engine.on('blockDeleted', seen);
    engine.deleteBlock(b.id);
    const payload = seen.mock.calls[0][0];
    expect(payload.id).toBe(b.id);
    expect(new Set(payload.affected)).toEqual(new Set([a.id, c.id]));
  });

  it('duplicates a block with content, type, size and deep-copied data', () => {
    const original = engine.createBlock(
      'text',
      'task',
      { x: 100, y: 100 },
      { width: 300, height: 200 }
    );
    original.data = { tags: ['x'] };
    const copy = engine.duplicateBlock(original.id);
    expect(copy.content).toBe('text');
    expect(copy.type).toBe('task');
    expect(copy.size).toEqual({ width: 300, height: 200 });
    expect(copy.data).toEqual({ tags: ['x'] });
    expect(copy.position).not.toEqual(original.position);
    original.data.tags.push('y');
    expect(copy.data.tags).toEqual(['x']);
  });

  it('clears all blocks', () => {
    engine.createBlock('a');
    engine.createBlock('b');
    engine.clear();
    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('filters blocks by type and searches content case-insensitively', () => {
    engine.createBlock('Alpha note', 'note');
    engine.createBlock('beta TASK', 'task');
    engine.createBlock('gamma', 'note');
    expect(engine.getBlocksByType('note')).toHaveLength(2);
    expect(engine.searchBlocks('ALPHA')).toHaveLength(1);
    expect(engine.searchBlocks('a')).toHaveLength(3);
  });
});

describe('BlockEngine — links', () => {
  /** @type {BlockEngine} */
  let engine;
  let a;
  let b;

  beforeEach(() => {
    engine = new BlockEngine();
    a = engine.createBlock('a');
    b = engine.createBlock('b');
  });

  it('rejects self-links', () => {
    expect(engine.linkBlocks(a.id, a.id)).toBe(false);
    expect(a.links.size).toBe(0);
  });

  it('rejects unknown link types and missing blocks', () => {
    expect(engine.linkBlocks(a.id, b.id, 'weird')).toBe(false);
    expect(engine.linkBlocks(a.id, 'ghost')).toBe(false);
  });

  it('creates single, reverse and double links with correct getLinkInfo', () => {
    engine.linkBlocks(a.id, b.id, 'single');
    expect(engine.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'single', from: a.id, to: b.id });

    engine.linkBlocks(a.id, b.id, 'reverse');
    expect(engine.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'reverse', from: b.id, to: a.id });

    engine.linkBlocks(a.id, b.id, 'double');
    expect(engine.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'double' });
    expect(a.hasLink(b.id)).toBe(true);
    expect(b.hasLink(a.id)).toBe(true);
  });

  it('stores and preserves labels across type changes', () => {
    engine.linkBlocks(a.id, b.id, 'single', 'depends on');
    expect(engine.getLinkInfo(a.id, b.id).label).toBe('depends on');
    engine.updateLinkType(a.id, b.id, 'double');
    expect(engine.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'double', label: 'depends on' });
  });

  it('sets link labels with undo support', () => {
    engine.linkBlocks(a.id, b.id, 'single');
    expect(engine.setLinkLabel(a.id, b.id, 'later')).toBe(true);
    expect(engine.getLinkInfo(a.id, b.id).label).toBe('later');
    engine.undo();
    expect(engine.getLinkInfo(a.id, b.id).label).toBe('');
  });

  it('returns false when setting a label on a non-existent link', () => {
    expect(engine.setLinkLabel(a.id, b.id, 'x')).toBe(false);
  });

  it('unlinks blocks in both directions', () => {
    engine.linkBlocks(a.id, b.id, 'double');
    expect(engine.unlinkBlocks(a.id, b.id)).toBe(true);
    expect(engine.getLinkInfo(a.id, b.id)).toBeNull();
  });

  it('returns false when unlinking blocks that are not linked', () => {
    expect(engine.unlinkBlocks(a.id, b.id)).toBe(false);
  });

  it('lists incoming and outgoing links', () => {
    const c = engine.createBlock('c');
    engine.linkBlocks(a.id, b.id, 'single');
    engine.linkBlocks(c.id, b.id, 'single');
    expect(
      engine
        .getIncomingLinks(b.id)
        .map((x) => x.id)
        .sort()
    ).toEqual([a.id, c.id].sort());
    expect(engine.getOutgoingLinks(a.id).map((x) => x.id)).toEqual([b.id]);
  });
});

describe('BlockEngine — events', () => {
  it('isolates throwing listeners so the rest still run', () => {
    const engine = new BlockEngine();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    engine.on('blockCreated', () => {
      throw new Error('boom');
    });
    engine.on('blockCreated', good);
    const block = engine.createBlock('a');
    expect(block).toBeTruthy();
    expect(good).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('supports off()', () => {
    const engine = new BlockEngine();
    const fn = vi.fn();
    engine.on('blockCreated', fn);
    engine.off('blockCreated', fn);
    engine.createBlock('a');
    expect(fn).not.toHaveBeenCalled();
  });

  it('emits historyChanged on mutations and undo/redo', () => {
    const engine = new BlockEngine();
    const fn = vi.fn();
    engine.on('historyChanged', fn);
    engine.createBlock('a');
    expect(fn).toHaveBeenCalled();
    fn.mockClear();
    engine.undo();
    expect(fn).toHaveBeenCalledWith({ canUndo: false, canRedo: true });
  });
});

describe('BlockEngine — undo/redo', () => {
  /** @type {BlockEngine} */
  let engine;

  beforeEach(() => {
    engine = new BlockEngine();
  });

  it('undoes and redoes block creation', () => {
    const block = engine.createBlock('a');
    expect(engine.undo()).toBe(true);
    expect(engine.getBlock(block.id)).toBeNull();
    expect(engine.redo()).toBe(true);
    expect(engine.getBlock(block.id)).toBeTruthy();
    expect(engine.getBlock(block.id).content).toBe('a');
  });

  it('undoes moves, resizes and content edits', () => {
    const block = engine.createBlock('a', 'default', { x: 100, y: 100 });
    engine.setBlockPosition(block.id, 200, 200);
    engine.setBlockSize(block.id, 400, 300);
    engine.setBlockContent(block.id, 'changed');

    engine.undo();
    expect(engine.getBlock(block.id).content).toBe('a');
    engine.undo();
    expect(engine.getBlock(block.id).size).toEqual({ width: 250, height: 150 });
    engine.undo();
    expect(engine.getBlock(block.id).position).toEqual({ x: 100, y: 100 });
  });

  it('restores a deleted block together with its links in both directions', () => {
    const a = engine.createBlock('a');
    const b = engine.createBlock('b');
    const c = engine.createBlock('c');
    engine.linkBlocks(a.id, b.id, 'single', 'ab');
    engine.linkBlocks(a.id, c.id, 'double', 'ac');

    engine.deleteBlock(a.id);
    expect(engine.getLinkInfo(a.id, c.id)).toBeNull();

    engine.undo();
    expect(engine.getBlock(a.id)).toBeTruthy();
    expect(engine.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'single', label: 'ab' });
    expect(engine.getLinkInfo(a.id, c.id)).toMatchObject({ type: 'double', label: 'ac' });
  });

  it('treats arrangeBlocks as a single undo step', () => {
    const a = engine.createBlock('a', 'default', { x: 1000, y: 1000 });
    const b = engine.createBlock('b', 'default', { x: 2000, y: 2000 });
    engine.arrangeBlocks(2);
    expect(a.position).toEqual({ x: 60, y: 60 }); // grid-snapped from startX/startY 50
    engine.undo();
    expect(engine.getBlock(a.id).position).toEqual({ x: 1000, y: 1000 });
    expect(engine.getBlock(b.id).position).toEqual({ x: 2000, y: 2000 });
  });

  it('undoes clear() and importFromJSON()', () => {
    const a = engine.createBlock('original');
    engine.clear();
    expect(engine.getAllBlocks()).toHaveLength(0);
    engine.undo();
    expect(engine.getBlock(a.id)?.content).toBe('original');

    const foreign = new BlockEngine();
    foreign.createBlock('imported');
    engine.importFromJSON(foreign.exportToJSON());
    expect(engine.getAllBlocks().map((x) => x.content)).toEqual(['imported']);
    engine.undo();
    expect(engine.getBlock(a.id)?.content).toBe('original');
    engine.redo();
    expect(engine.getAllBlocks().map((x) => x.content)).toEqual(['imported']);
  });

  it('respects the history limit', () => {
    const limited = new BlockEngine({ historyLimit: 3 });
    for (let i = 0; i < 5; i++) {
      limited.createBlock(`b${i}`);
    }
    let undone = 0;
    while (limited.undo()) undone++;
    expect(undone).toBe(3);
  });

  it('link changes are undoable', () => {
    const a = engine.createBlock('a');
    const b = engine.createBlock('b');
    engine.linkBlocks(a.id, b.id, 'single');
    engine.updateLinkType(a.id, b.id, 'double');
    engine.undo();
    expect(engine.getLinkInfo(a.id, b.id).type).toBe('single');
    engine.undo();
    expect(engine.getLinkInfo(a.id, b.id)).toBeNull();
  });
});

describe('BlockEngine — persistence', () => {
  it('roundtrips blocks, links, labels and custom data', () => {
    const engine = new BlockEngine();
    const a = engine.createBlock('alpha', 'note', { x: 100, y: 120 }, { width: 260, height: 180 });
    const b = engine.createBlock('beta', 'task');
    a.data = { priority: 'high' };
    engine.linkBlocks(a.id, b.id, 'double', 'pair');

    const json = engine.exportToJSON();
    const restored = new BlockEngine();
    expect(restored.importFromJSON(json)).toBe(true);

    const ra = restored.getBlock(a.id);
    expect(ra.content).toBe('alpha');
    expect(ra.type).toBe('note');
    expect(ra.position).toEqual({ x: 100, y: 120 });
    expect(ra.size).toEqual({ width: 260, height: 180 });
    expect(ra.data).toEqual({ priority: 'high' });
    expect(restored.getLinkInfo(a.id, b.id)).toMatchObject({ type: 'double', label: 'pair' });
  });

  it('rejects invalid payloads', () => {
    const engine = new BlockEngine();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(engine.importFromJSON('not json at all')).toBe(false);
    expect(engine.importFromJSON('{"foo": 1}')).toBe(false);
    expect(engine.importFromJSON('null')).toBe(false);
    errorSpy.mockRestore();
  });

  it('tolerates missing metadata, sizes and legacy link arrays', () => {
    const engine = new BlockEngine();
    const payload = {
      blocks: [
        { id: 'one', content: 'legacy', links: ['two'] },
        { id: 'two', content: 'other' },
      ],
    };
    expect(engine.importFromJSON(JSON.stringify(payload))).toBe(true);
    const one = engine.getBlock('one');
    expect(one.metadata.createdAt).toBeTruthy();
    expect(one.size).toEqual({ width: 250, height: 150 });
    expect(engine.getLinkInfo('one', 'two')).toMatchObject({ type: 'single' });
  });

  it('prunes links pointing to non-existent blocks', () => {
    const engine = new BlockEngine();
    const payload = {
      blocks: [{ id: 'one', content: 'x', links: [{ id: 'ghost', type: 'single' }] }],
    };
    engine.importFromJSON(JSON.stringify(payload));
    expect(engine.getBlock('one').links.size).toBe(0);
  });

  it('imports legacy customData into data', () => {
    const engine = new BlockEngine();
    const payload = { blocks: [{ id: 'one', customData: { tag: 'legacy' } }] };
    engine.importFromJSON(JSON.stringify(payload));
    expect(engine.getBlock('one').data).toEqual({ tag: 'legacy' });
  });

  it('imports only known settings keys', () => {
    const engine = new BlockEngine();
    const payload = { blocks: [], settings: { gridSize: 40, malicious: true } };
    engine.importFromJSON(JSON.stringify(payload));
    expect(engine.settings.gridSize).toBe(40);
    expect('malicious' in engine.settings).toBe(false);
  });
});

describe('BlockEngine — settings', () => {
  it('updateSettings changes known keys and ignores unknown ones', () => {
    const engine = new BlockEngine();
    const result = engine.updateSettings({ gridSize: 10, nope: 5 });
    expect(engine.settings.gridSize).toBe(10);
    expect('nope' in engine.settings).toBe(false);
    expect(result.gridSize).toBe(10);
  });
});
