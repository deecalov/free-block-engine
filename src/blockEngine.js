/**
 * Free Block Engine — core data management and business logic.
 *
 * Holds the block graph, link management, undo/redo history, search,
 * persistence (JSON import/export) and the pub/sub event system.
 * Contains no DOM code; rendering lives in BlockRenderer.
 *
 * @author Paul Deecalov
 * @license MIT
 */

import { Block } from './block.js';
import { History } from './history.js';

/** Link types accepted by linkBlocks(). */
export const LINK_TYPES = Object.freeze(['single', 'reverse', 'double']);

export class BlockEngine {
  /** @param {object} [settings] Partial settings override. */
  constructor(settings = {}) {
    /** @type {Map<string, Block>} */
    this.blocks = new Map();
    /** @type {Map<string, Array<(data: unknown) => void>>} */
    this.eventListeners = new Map();
    this.settings = {
      gridSize: 20,
      defaultSpacing: 300,
      minBlockWidth: 150,
      minBlockHeight: 100,
      historyLimit: 100,
      ...settings,
    };
    this.history = new History(this.settings.historyLimit);
    this._replaying = false;
  }

  // ---------------------------------------------------------------- events

  /**
   * Subscribe to an engine event.
   * @param {string} event
   * @param {(data: unknown) => void} callback
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * Unsubscribe a previously registered callback.
   * @param {string} event
   * @param {(data: unknown) => void} callback
   */
  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit an event. A throwing listener is isolated: it is logged and the
   * remaining listeners still run, so one broken subscriber cannot break
   * an engine operation.
   *
   * @param {string} event
   * @param {unknown} [data]
   */
  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const callback of [...listeners]) {
      try {
        callback(data);
      } catch (error) {
        console.error(`[BlockEngine] Listener for "${event}" failed:`, error);
      }
    }
  }

  // --------------------------------------------------------------- history

  /**
   * Record an undoable operation unless we are replaying history.
   * @param {string} label
   * @param {() => void} undo
   * @param {() => void} redo
   */
  _record(label, undo, redo) {
    if (this._replaying) return;
    this.history.record({ label, undo, redo });
    this.emit('historyChanged', this.getHistoryState());
  }

  /** Run fn with history recording suppressed. @param {() => void} fn */
  _replay(fn) {
    this._replaying = true;
    try {
      fn();
    } finally {
      this._replaying = false;
    }
  }

  /** Undo the last operation. @returns {boolean} */
  undo() {
    let done = false;
    this._replay(() => {
      done = this.history.undo();
    });
    if (done) this.emit('historyChanged', this.getHistoryState());
    return done;
  }

  /** Redo the last undone operation. @returns {boolean} */
  redo() {
    let done = false;
    this._replay(() => {
      done = this.history.redo();
    });
    if (done) this.emit('historyChanged', this.getHistoryState());
    return done;
  }

  canUndo() {
    return this.history.canUndo();
  }

  canRedo() {
    return this.history.canRedo();
  }

  /** Drop all undo/redo history. */
  clearHistory() {
    this.history.clear();
    this.emit('historyChanged', this.getHistoryState());
  }

  /** @returns {{canUndo: boolean, canRedo: boolean}} */
  getHistoryState() {
    return { canUndo: this.canUndo(), canRedo: this.canRedo() };
  }

  /**
   * Group subsequent operations into a single undo step until endBatch().
   * @param {string} [label]
   */
  beginBatch(label = 'batch') {
    this.history.beginBatch(label);
  }

  /** Close the batch opened by beginBatch(). */
  endBatch() {
    this.history.endBatch();
    this.emit('historyChanged', this.getHistoryState());
  }

  // ---------------------------------------------------------------- blocks

  /**
   * Create a new block.
   * @param {string} [content] The content of the block.
   * @param {string} [type] Block type ('default', 'note', 'task', ...).
   * @param {{x: number, y: number}|null} [position] Optional position (auto-positioned if omitted).
   * @param {{width: number, height: number}|null} [size] Optional size (default 250x150).
   * @returns {Block}
   */
  createBlock(content = '', type = 'default', position = null, size = null) {
    const id = this.generateId();
    const block = new Block(id, content, type);
    const pos = position ?? this.getAutoPosition();
    block.setPosition(pos.x, pos.y);
    if (size) {
      block.setSize(size.width, size.height);
    }
    this.blocks.set(id, block);

    const snapshot = block.toJSON();
    this._record(
      'createBlock',
      () => this.deleteBlock(id),
      () => this._restoreBlock(snapshot, [])
    );
    this.emit('blockCreated', block);
    return block;
  }

  /**
   * Restore a block from a snapshot, re-attaching incoming links.
   * Used by undo/redo; emits 'blockRestored'.
   *
   * @param {object} snapshot Block JSON.
   * @param {Array<{fromId: string, meta: object}>} incomingLinks
   * @returns {Block}
   */
  _restoreBlock(snapshot, incomingLinks) {
    const block = Block.fromJSON(snapshot);
    this.blocks.set(block.id, block);
    for (const { fromId, meta } of incomingLinks) {
      const source = this.blocks.get(fromId);
      if (source) {
        source.links.set(block.id, { ...meta });
      }
    }
    this.emit('blockRestored', block);
    return block;
  }

  /**
   * Delete a block and all links pointing to it.
   * The 'blockDeleted' event carries `affected`: ids of blocks whose links
   * changed because of the deletion.
   *
   * @param {string} id
   * @returns {boolean}
   */
  deleteBlock(id) {
    const block = this.blocks.get(id);
    if (!block) return false;

    const snapshot = block.toJSON();
    const outgoing = [...block.links.keys()];
    const incoming = [];
    this.blocks.forEach((other) => {
      if (other.id !== id && other.hasLink(id)) {
        incoming.push({ fromId: other.id, meta: { ...other.links.get(id) } });
        other.removeLink(id);
      }
    });
    this.blocks.delete(id);

    this._record(
      'deleteBlock',
      () => this._restoreBlock(snapshot, incoming),
      () => this.deleteBlock(id)
    );
    const affected = [...new Set([...outgoing, ...incoming.map((i) => i.fromId)])];
    this.emit('blockDeleted', { id, affected });
    return true;
  }

  /**
   * Create a copy of a block (content, type, size and data; links are not
   * copied). Recorded as a single undo step, so redo restores the data too.
   * @param {string} id
   * @returns {Block|null}
   */
  duplicateBlock(id) {
    const source = this.blocks.get(id);
    if (!source) return null;
    const offset = this.settings.gridSize * 2;
    const data = JSON.parse(JSON.stringify(source.data ?? {}));
    this.beginBatch('duplicateBlock');
    const copy = this.createBlock(
      source.content,
      source.type,
      { x: source.position.x + offset, y: source.position.y + offset },
      { ...source.size }
    );
    this.setBlockData(copy.id, data);
    this.endBatch();
    return copy;
  }

  /** Remove all blocks (undoable). */
  clear() {
    if (this.blocks.size === 0) return;
    const before = this.exportToJSON();
    this.blocks.clear();
    this._record(
      'clear',
      () => this._loadSnapshot(before),
      () => {
        this.blocks.clear();
        this.emit('engineCleared');
      }
    );
    this.emit('engineCleared');
  }

  /**
   * @param {string} id
   * @returns {Block|null}
   */
  getBlock(id) {
    return this.blocks.get(id) || null;
  }

  /** @returns {Block[]} */
  getAllBlocks() {
    return Array.from(this.blocks.values());
  }

  /**
   * @param {string} type
   * @returns {Block[]}
   */
  getBlocksByType(type) {
    return this.getAllBlocks().filter((block) => block.type === type);
  }

  /**
   * Case-insensitive content search.
   * @param {string} query
   * @returns {Block[]}
   */
  searchBlocks(query) {
    const lowerQuery = String(query).toLowerCase();
    return this.getAllBlocks().filter((block) => block.content.toLowerCase().includes(lowerQuery));
  }

  /**
   * Update block content (undoable).
   * @param {string} id
   * @param {string} content
   * @returns {boolean}
   */
  setBlockContent(id, content) {
    const block = this.blocks.get(id);
    if (!block) return false;
    const prev = block.content;
    if (prev === content) return true;
    block.setContent(content);
    this._record(
      'setContent',
      () => this.setBlockContent(id, prev),
      () => this.setBlockContent(id, content)
    );
    this.emit('blockUpdated', block);
    return true;
  }

  /**
   * Replace the custom data payload of a block (undoable).
   * @param {string} id
   * @param {Record<string, unknown>} data
   * @returns {boolean}
   */
  setBlockData(id, data) {
    const block = this.blocks.get(id);
    if (!block) return false;
    const prev = block.data;
    block.data = data ?? {};
    block.touch();
    this._record(
      'setData',
      () => this.setBlockData(id, prev),
      () => this.setBlockData(id, data)
    );
    this.emit('blockUpdated', block);
    return true;
  }

  /**
   * Update block position (undoable).
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @param {boolean} [snapToGrid]
   * @returns {boolean}
   */
  setBlockPosition(id, x, y, snapToGrid = true) {
    const block = this.blocks.get(id);
    if (!block) return false;
    if (snapToGrid) {
      x = Math.round(x / this.settings.gridSize) * this.settings.gridSize;
      y = Math.round(y / this.settings.gridSize) * this.settings.gridSize;
    }
    const prev = { ...block.position };
    if (prev.x === x && prev.y === y) return true;
    block.setPosition(x, y);
    this._record(
      'moveBlock',
      () => this.setBlockPosition(id, prev.x, prev.y, false),
      () => this.setBlockPosition(id, x, y, false)
    );
    this.emit('blockMoved', block);
    return true;
  }

  /**
   * Update block size, respecting minimum dimensions (undoable).
   * @param {string} id
   * @param {number} width
   * @param {number} height
   * @returns {boolean}
   */
  setBlockSize(id, width, height) {
    const block = this.blocks.get(id);
    if (!block) return false;
    width = Math.max(width, this.settings.minBlockWidth);
    height = Math.max(height, this.settings.minBlockHeight);
    const prev = { ...block.size };
    if (prev.width === width && prev.height === height) return true;
    block.setSize(width, height);
    this._record(
      'resizeBlock',
      () => this.setBlockSize(id, prev.width, prev.height),
      () => this.setBlockSize(id, width, height)
    );
    this.emit('blockResized', block);
    return true;
  }

  // ----------------------------------------------------------------- links

  /**
   * Link two blocks. Self-links are rejected.
   *
   * @param {string} fromId Source block id.
   * @param {string} toId Target block id.
   * @param {string} [linkType] 'single', 'reverse' or 'double'.
   * @param {string} [label] Optional connection label.
   * @returns {boolean}
   */
  linkBlocks(fromId, toId, linkType = 'single', label = '') {
    if (fromId === toId) return false;
    if (!LINK_TYPES.includes(linkType)) return false;
    const fromBlock = this.blocks.get(fromId);
    const toBlock = this.blocks.get(toId);
    if (!fromBlock || !toBlock) return false;

    const prev = this._capturePairState(fromId, toId);

    fromBlock.removeLink(toId);
    toBlock.removeLink(fromId);
    if (linkType === 'single') {
      fromBlock.addLink(toId, 'single', label);
    } else if (linkType === 'reverse') {
      toBlock.addLink(fromId, 'single', label);
    } else {
      fromBlock.addLink(toId, 'double', label);
      toBlock.addLink(fromId, 'double', label);
    }

    const next = this._capturePairState(fromId, toId);
    this._record(
      'linkBlocks',
      () => this._applyPairState(fromId, toId, prev),
      () => this._applyPairState(fromId, toId, next)
    );
    this.emit('blocksLinked', { from: fromBlock, to: toBlock, linkType, label });
    return true;
  }

  /**
   * Change the type of an existing connection, preserving its label.
   * @param {string} fromId
   * @param {string} toId
   * @param {string} newLinkType
   * @returns {boolean}
   */
  updateLinkType(fromId, toId, newLinkType) {
    const info = this.getLinkInfo(fromId, toId);
    return this.linkBlocks(fromId, toId, newLinkType, info?.label ?? '');
  }

  /**
   * Set the label of an existing connection (undoable).
   * @param {string} fromId
   * @param {string} toId
   * @param {string} label
   * @returns {boolean}
   */
  setLinkLabel(fromId, toId, label) {
    const fromBlock = this.blocks.get(fromId);
    const toBlock = this.blocks.get(toId);
    if (!fromBlock || !toBlock) return false;

    const prev = this._capturePairState(fromId, toId);
    if (!prev.ab && !prev.ba) return false;

    let changed = false;
    for (const [owner, targetId] of [
      [fromBlock, toId],
      [toBlock, fromId],
    ]) {
      const meta = owner.links.get(targetId);
      if (meta && meta.label !== label) {
        meta.label = label;
        owner.touch();
        changed = true;
      }
    }
    if (!changed) return true;

    const next = this._capturePairState(fromId, toId);
    this._record(
      'setLinkLabel',
      () => this._applyPairState(fromId, toId, prev),
      () => this._applyPairState(fromId, toId, next)
    );
    this.emit('linkUpdated', { fromId, toId, label });
    return true;
  }

  /**
   * Remove any connection between two blocks.
   * @param {string} fromId
   * @param {string} toId
   * @returns {boolean}
   */
  unlinkBlocks(fromId, toId) {
    const fromBlock = this.blocks.get(fromId);
    const toBlock = this.blocks.get(toId);
    if (!fromBlock && !toBlock) return false;

    const prev = this._capturePairState(fromId, toId);
    if (!prev.ab && !prev.ba) return false;

    if (fromBlock) fromBlock.removeLink(toId);
    if (toBlock) toBlock.removeLink(fromId);

    this._record(
      'unlinkBlocks',
      () => this._applyPairState(fromId, toId, prev),
      () => this._applyPairState(fromId, toId, { ab: null, ba: null })
    );
    this.emit('blocksUnlinked', { fromId, toId });
    return true;
  }

  /**
   * Get canonical link info between two blocks.
   * @param {string} fromId
   * @param {string} toId
   * @returns {{type: string, from: string, to: string, label: string}|null}
   */
  getLinkInfo(fromId, toId) {
    const fromBlock = this.blocks.get(fromId);
    const toBlock = this.blocks.get(toId);
    if (!fromBlock || !toBlock) return null;

    const forward = fromBlock.getLinkMeta(toId);
    const backward = toBlock.getLinkMeta(fromId);

    if (forward && backward) {
      return {
        type: 'double',
        from: fromId,
        to: toId,
        label: forward.label || backward.label || '',
      };
    }
    if (forward) {
      return { type: 'single', from: fromId, to: toId, label: forward.label || '' };
    }
    if (backward) {
      return { type: 'reverse', from: toId, to: fromId, label: backward.label || '' };
    }
    return null;
  }

  /**
   * Blocks that link to the given block.
   * @param {string} id
   * @returns {Block[]}
   */
  getIncomingLinks(id) {
    return this.getAllBlocks().filter((block) => block.hasLink(id));
  }

  /**
   * Blocks the given block links to.
   * @param {string} id
   * @returns {Block[]}
   */
  getOutgoingLinks(id) {
    const block = this.blocks.get(id);
    if (!block) return [];
    return Array.from(block.links.keys())
      .map((linkId) => this.getBlock(linkId))
      .filter((b) => b !== null);
  }

  /** Snapshot of the link state between a pair of blocks. */
  _capturePairState(aId, bId) {
    const a = this.blocks.get(aId);
    const b = this.blocks.get(bId);
    return {
      ab: a && a.links.get(bId) ? { ...a.links.get(bId) } : null,
      ba: b && b.links.get(aId) ? { ...b.links.get(aId) } : null,
    };
  }

  /** Restore the link state between a pair of blocks (undo/redo helper). */
  _applyPairState(aId, bId, state) {
    const a = this.blocks.get(aId);
    const b = this.blocks.get(bId);
    if (!a || !b) return;
    if (state.ab) a.links.set(bId, { ...state.ab });
    else a.links.delete(bId);
    if (state.ba) b.links.set(aId, { ...state.ba });
    else b.links.delete(aId);
    this.emit('linksChanged', { fromId: aId, toId: bId });
  }

  // ---------------------------------------------------------------- layout

  /**
   * Position for a new block: to the right of the current rightmost block.
   * @returns {{x: number, y: number}}
   */
  getAutoPosition() {
    const blocks = this.getAllBlocks();
    if (blocks.length === 0) {
      return { x: 50, y: 50 };
    }
    let maxX = 0;
    let maxY = 50;
    blocks.forEach((block) => {
      if (block.position.x > maxX) {
        maxX = block.position.x;
        maxY = block.position.y;
      }
    });
    return { x: maxX + this.settings.defaultSpacing, y: maxY };
  }

  /**
   * Arrange blocks in a simple grid layout (single undo step).
   * @param {number} [columns]
   */
  arrangeBlocks(columns = 3) {
    const blocks = this.getAllBlocks();
    const spacing = this.settings.defaultSpacing;
    const startX = 50;
    const startY = 50;

    this.beginBatch('arrangeBlocks');
    blocks.forEach((block, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      this.setBlockPosition(block.id, startX + col * spacing, startY + row * spacing);
    });
    this.endBatch();

    this.emit('blocksArranged', { count: blocks.length });
  }

  // ----------------------------------------------------------- persistence

  /**
   * Export all blocks and settings as a JSON string.
   * @returns {string}
   */
  exportToJSON() {
    const data = {
      version: 2,
      blocks: this.getAllBlocks().map((block) => block.toJSON()),
      settings: { ...this.settings },
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import blocks from a JSON string, replacing the current state (undoable).
   * Validates the payload, tolerates the legacy format and prunes links that
   * point to non-existent blocks.
   *
   * @param {string} jsonData
   * @returns {boolean}
   */
  importFromJSON(jsonData) {
    let data;
    try {
      data = JSON.parse(jsonData);
    } catch (error) {
      console.error('[BlockEngine] Import failed: invalid JSON.', error);
      return false;
    }
    if (!data || !Array.isArray(data.blocks)) {
      console.error('[BlockEngine] Import failed: "blocks" array is missing.');
      return false;
    }

    const before = this.exportToJSON();
    if (!this._loadSnapshot(data)) return false;
    const after = this.exportToJSON();

    this._record(
      'import',
      () => this._loadSnapshot(before),
      () => this._loadSnapshot(after)
    );
    return true;
  }

  /**
   * Replace current state from a snapshot (string or parsed object).
   * Emits 'blocksImported'. Does not touch history.
   *
   * @param {string|object} data
   * @returns {boolean}
   */
  _loadSnapshot(data) {
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return false;
      }
    }
    if (!data || !Array.isArray(data.blocks)) return false;

    this.blocks.clear();

    if (data.settings && typeof data.settings === 'object') {
      for (const key of Object.keys(this.settings)) {
        if (key in data.settings) {
          this.settings[key] = data.settings[key];
        }
      }
      this.history.setLimit(this.settings.historyLimit);
    }

    for (const raw of data.blocks) {
      if (!raw || raw.id == null) continue;
      const block = Block.fromJSON(raw);
      this.blocks.set(block.id, block);
    }

    // Prune links pointing to blocks that don't exist.
    this.blocks.forEach((block) => {
      for (const targetId of [...block.links.keys()]) {
        if (!this.blocks.has(targetId)) {
          block.links.delete(targetId);
        }
      }
    });

    this.emit('blocksImported', { count: this.blocks.size });
    return true;
  }

  // ---------------------------------------------------------------- config

  /**
   * Update known settings keys; unknown keys are ignored.
   * @param {object} [partial]
   * @returns {object} The resulting settings.
   */
  updateSettings(partial = {}) {
    for (const key of Object.keys(partial)) {
      if (key in this.settings) {
        this.settings[key] = partial[key];
      }
    }
    this.history.setLimit(this.settings.historyLimit);
    this.emit('settingsUpdated', { ...this.settings });
    return { ...this.settings };
  }

  /**
   * Generate a unique block id (crypto.randomUUID when available).
   * @returns {string}
   */
  generateId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `block_${uuid}`;
    return `block_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
  }
}
