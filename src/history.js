/**
 * Free Block Engine — undo/redo command stack.
 *
 * Entries are plain objects: `{ label, undo(), redo() }`. The engine records
 * an entry for every mutating operation; batches group several entries into
 * one atomic undo step (used e.g. by arrangeBlocks and multi-block drag).
 * Batches nest: entries are grouped until the outermost batch closes.
 *
 * @author Paul Deecalov
 * @license MIT
 */

export class History {
  /** @param {number} [limit] Maximum number of undo entries kept. */
  constructor(limit = 100) {
    this.limit = limit;
    /** @type {Array<{label: string, undo: () => void, redo: () => void}>} */
    this.undoStack = [];
    /** @type {Array<{label: string, undo: () => void, redo: () => void}>} */
    this.redoStack = [];
    this._batch = null;
    this._batchDepth = 0;
  }

  /**
   * Change the maximum number of undo entries, trimming the oldest ones
   * if the stack already exceeds the new limit.
   * @param {number} limit
   */
  setLimit(limit) {
    this.limit = limit;
    while (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
  }

  /**
   * Record an entry. While a batch is open the entry is appended to it
   * instead of the main stack.
   *
   * @param {{label: string, undo: () => void, redo: () => void}} entry
   */
  record(entry) {
    if (this._batch) {
      this._batch.entries.push(entry);
      return;
    }
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  /**
   * Open a batch: subsequent records are grouped into one undo step.
   * Nested calls increase the depth; the batch closes when the outermost
   * endBatch() is reached.
   *
   * @param {string} label
   */
  beginBatch(label) {
    if (this._batch) {
      this._batchDepth++;
      return;
    }
    this._batch = { label, entries: [] };
    this._batchDepth = 1;
  }

  /** Close the current batch level; the outermost close pushes one entry. */
  endBatch() {
    if (!this._batch) return;
    this._batchDepth--;
    if (this._batchDepth > 0) return;
    const batch = this._batch;
    this._batch = null;
    if (batch.entries.length === 0) return;
    this.record({
      label: batch.label,
      undo: () => {
        for (let i = batch.entries.length - 1; i >= 0; i--) {
          batch.entries[i].undo();
        }
      },
      redo: () => {
        for (const entry of batch.entries) {
          entry.redo();
        }
      },
    });
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  /** @returns {boolean} true if an entry was undone. */
  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    entry.undo();
    this.redoStack.push(entry);
    return true;
  }

  /** @returns {boolean} true if an entry was redone. */
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    entry.redo();
    this.undoStack.push(entry);
    return true;
  }

  /** Drop all history. */
  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this._batch = null;
    this._batchDepth = 0;
  }
}
