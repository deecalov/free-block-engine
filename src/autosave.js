/**
 * Free Block Engine — storage autosave helper.
 *
 * Debounces engine changes and persists the JSON export into a Web
 * Storage-compatible backend (localStorage by default). Listens to
 * 'historyChanged' — fired by every mutating operation, undo/redo,
 * import and clear — plus 'settingsUpdated'. Zero dependencies and
 * SSR-safe: without a storage backend it stays inert.
 *
 * @author Paul Deecalov
 * @license MIT
 */

/**
 * @typedef {object} AutosaveStorage
 * @property {(key: string) => string|null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

export class Autosave {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {object} [options]
   * @param {string} [options.key] Storage key ('free-block-engine').
   * @param {number} [options.debounceMs] Debounce delay in ms (500).
   * @param {AutosaveStorage} [options.storage] Storage backend (globalThis.localStorage).
   */
  constructor(engine, options = {}) {
    this.engine = engine;
    this.key = options.key ?? 'free-block-engine';
    this.debounceMs = options.debounceMs ?? 500;
    this.storage = options.storage ?? globalThis.localStorage ?? null;
    this._timer = null;
    this._destroyed = false;
    this._schedule = () => {
      if (this._destroyed) return;
      if (this._timer !== null) clearTimeout(this._timer);
      this._timer = setTimeout(() => this._write(), this.debounceMs);
    };
    this._events = ['historyChanged', 'settingsUpdated'];
    for (const event of this._events) {
      this.engine.on(event, this._schedule);
    }
  }

  /**
   * Import the saved board into the engine, if a save exists.
   * @returns {boolean} true when a save was found and imported.
   */
  load() {
    if (!this.storage) return false;
    let json;
    try {
      json = this.storage.getItem(this.key);
    } catch (error) {
      console.error('[Autosave] Failed to read from storage:', error);
      return false;
    }
    if (json == null) return false;
    return this.engine.importFromJSON(json);
  }

  /** Save immediately, cancelling any pending debounced write. */
  flush() {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._write();
  }

  /** Remove the saved entry from storage. */
  clear() {
    if (!this.storage) return;
    try {
      this.storage.removeItem(this.key);
    } catch (error) {
      console.error('[Autosave] Failed to remove from storage:', error);
    }
  }

  /** Unsubscribe from the engine and stop saving. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    for (const event of this._events) {
      this.engine.off(event, this._schedule);
    }
  }

  _write() {
    this._timer = null;
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, this.engine.exportToJSON());
    } catch (error) {
      console.error('[Autosave] Failed to write to storage:', error);
    }
  }
}

/**
 * Create an autosaver bound to an engine.
 *
 * @param {import('./blockEngine.js').BlockEngine} engine
 * @param {object} [options] See {@link Autosave}.
 * @returns {Autosave}
 */
export function createAutosave(engine, options = {}) {
  return new Autosave(engine, options);
}
