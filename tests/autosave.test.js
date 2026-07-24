import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlockEngine, Autosave, createAutosave } from '../src/index.js';

/** In-memory Web Storage stub with spied methods. */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: vi.fn((key) => (map.has(key) ? map.get(key) : null)),
    setItem: vi.fn((key, value) => map.set(key, String(value))),
    removeItem: vi.fn((key) => map.delete(key)),
  };
}

describe('Autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves debounced after engine mutations', () => {
    const engine = new BlockEngine();
    const storage = memoryStorage();
    const autosave = createAutosave(engine, { storage, key: 'board' });
    expect(autosave).toBeInstanceOf(Autosave);

    engine.createBlock('a');
    engine.createBlock('b');
    expect(storage.setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(storage.setItem).toHaveBeenCalledTimes(1); // coalesced into one write
    expect(JSON.parse(storage.getItem('board')).blocks).toHaveLength(2);
    autosave.destroy();
  });

  it('saves after settings changes and undo/redo', () => {
    const engine = new BlockEngine();
    const storage = memoryStorage();
    const autosave = createAutosave(engine, { storage });

    engine.updateSettings({ gridSize: 40 });
    vi.advanceTimersByTime(500);
    expect(JSON.parse(storage.getItem('free-block-engine')).settings.gridSize).toBe(40);

    engine.createBlock('a');
    vi.advanceTimersByTime(500);
    engine.undo();
    vi.advanceTimersByTime(500);
    expect(JSON.parse(storage.getItem('free-block-engine')).blocks).toHaveLength(0);
    autosave.destroy();
  });

  it('load() imports an existing save and reports a missing one', () => {
    const source = new BlockEngine();
    source.createBlock('from save');
    const storage = memoryStorage();
    storage.setItem('board', source.exportToJSON());
    storage.setItem.mockClear();

    const engine = new BlockEngine();
    const autosave = createAutosave(engine, { storage, key: 'board' });
    expect(autosave.load()).toBe(true);
    expect(engine.getAllBlocks().map((b) => b.content)).toEqual(['from save']);

    const empty = createAutosave(new BlockEngine(), { storage, key: 'missing' });
    expect(empty.load()).toBe(false);
    autosave.destroy();
    empty.destroy();
  });

  it('flush() writes immediately and cancels the pending debounce', () => {
    const engine = new BlockEngine();
    const storage = memoryStorage();
    const autosave = createAutosave(engine, { storage, key: 'board' });

    engine.createBlock('a');
    autosave.flush();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    autosave.destroy();
  });

  it('clear() removes the saved entry', () => {
    const engine = new BlockEngine();
    const storage = memoryStorage();
    const autosave = createAutosave(engine, { storage, key: 'board' });
    engine.createBlock('a');
    autosave.flush();
    expect(storage.getItem('board')).not.toBeNull();

    autosave.clear();
    expect(storage.getItem('board')).toBeNull();
    autosave.destroy();
  });

  it('stops saving after destroy()', () => {
    const engine = new BlockEngine();
    const storage = memoryStorage();
    const autosave = createAutosave(engine, { storage });
    autosave.destroy();

    engine.createBlock('a');
    vi.advanceTimersByTime(1000);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('survives storage write errors without breaking the engine', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = new BlockEngine();
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const autosave = createAutosave(engine, { storage });

    engine.createBlock('a');
    vi.advanceTimersByTime(500);
    expect(errorSpy).toHaveBeenCalled();
    expect(engine.getAllBlocks()).toHaveLength(1);
    errorSpy.mockRestore();
    autosave.destroy();
  });

  it('defaults to globalThis.localStorage', () => {
    const engine = new BlockEngine();
    const autosave = createAutosave(engine, { key: 'fbe-test-default' });

    engine.createBlock('a');
    vi.advanceTimersByTime(500);
    expect(JSON.parse(window.localStorage.getItem('fbe-test-default')).blocks).toHaveLength(1);

    window.localStorage.removeItem('fbe-test-default');
    autosave.destroy();
  });
});
