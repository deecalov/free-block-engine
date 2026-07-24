/**
 * Free Block Engine — visual rendering layer.
 *
 * Renders the block graph into a container element with a zoom/pan camera
 * (CSS transform), incremental DOM updates driven by engine events, SVG
 * connections with arrows and labels, a navigable minimap, lasso selection
 * and an optional read-only mode. Multiple renderer instances can coexist
 * on one page; destroy() releases every listener and DOM node.
 *
 * @author Paul Deecalov
 * @license MIT
 */

import { LINK_TYPES } from './blockEngine.js';
import { injectStyles } from './styles.js';
import { ConnectionLayer } from './connectionLayer.js';
import { Minimap } from './minimap.js';
import { LinkEditorPopup } from './linkEditor.js';
import { InteractionController } from './interaction.js';
import { GuideOverlay } from './snapGuides.js';
import { ContextMenu } from './contextMenu.js';
import { exportToSVG, exportToPNG } from './exporter.js';

export class BlockRenderer {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {string|HTMLElement} containerOrId Container element or its id.
   * @param {object} [options]
   * @param {string} [options.defaultLinkType] Link type used by linking mode ('single').
   * @param {boolean} [options.readOnly] Disable all editing interactions.
   * @param {boolean} [options.showMinimap] Show the minimap (true).
   * @param {boolean} [options.confirmDelete] Ask for confirmation before deleting (true).
   * @param {number} [options.minZoom] Lower zoom bound (0.2).
   * @param {number} [options.maxZoom] Upper zoom bound (3).
   * @param {boolean} [options.keyboardShortcuts] Enable built-in hotkeys: Ctrl/Cmd+Z/Y
   *   undo/redo, Ctrl+A select all, Ctrl+D duplicate, Delete/Backspace delete the
   *   selection, arrows nudge the selection (false).
   * @param {(block: import('./block.js').Block, element: HTMLElement, context: {readOnly: boolean}) => boolean|void} [options.renderContent]
   *   Custom content renderer (e.g. markdown). Render into `element` and return
   *   true to take ownership — the built-in text editing is disabled for that
   *   block. Any falsy return falls back to plain-text rendering.
   * @param {boolean} [options.cullOffscreen] Hide blocks outside the visible area
   *   to keep large boards responsive (false).
   * @param {number} [options.cullMargin] Extra world-space margin kept visible
   *   around the viewport when culling (400).
   * @param {'light'|'dark'|'auto'} [options.theme] Colour scheme; `auto` follows
   *   `prefers-color-scheme` and reacts to changes ('light').
   * @param {boolean} [options.snapGuides] Align dragged blocks to the edges and
   *   centers of their neighbours, showing guide lines (false).
   * @param {number} [options.snapThreshold] Screen-pixel distance within which
   *   alignment snapping kicks in (6).
   * @param {boolean} [options.contextMenu] Show a context menu on right-click and
   *   touch long-press (false).
   * @param {(target: import('./contextMenu.js').ContextMenuTarget, defaults: import('./contextMenu.js').ContextMenuItem[]) => import('./contextMenu.js').ContextMenuItem[]} [options.contextMenuItems]
   *   Replace or amend the menu items.
   */
  constructor(engine, containerOrId, options = {}) {
    this.engine = engine;
    this.container =
      typeof containerOrId === 'string' ? document.getElementById(containerOrId) : containerOrId;
    if (!this.container) {
      throw new Error(`BlockRenderer: container "${containerOrId}" not found`);
    }

    this.options = {
      defaultLinkType: 'single',
      readOnly: false,
      showMinimap: true,
      confirmDelete: true,
      minZoom: 0.2,
      maxZoom: 3,
      keyboardShortcuts: false,
      renderContent: null,
      cullOffscreen: false,
      cullMargin: 400,
      theme: 'light',
      snapGuides: false,
      snapThreshold: 6,
      contextMenu: false,
      contextMenuItems: null,
      ...options,
    };

    /** @type {Set<string>} */
    this.selectedBlocks = new Set();
    this.viewMode = 'free';
    this.camera = { x: 0, y: 0, zoom: 1 };
    /** Called after every camera change with a copy of the camera. */
    this.onCameraChange = null;
    /** Called with 'light'/'dark' when an `auto` theme follows an OS change. */
    this.onThemeChange = null;
    this._themeQuery = null;
    this._themeListener = null;

    /** @type {Map<string, HTMLElement>} */
    this.blockElements = new Map();
    this._gestureOverrides = new Map();
    this._abort = new AbortController();
    this._engineSubs = [];
    this._destroyed = false;
    this._cullPending = false;

    const doc = this.container.ownerDocument;
    injectStyles(doc);
    this.container.classList.add('blocks-container');
    this.container.innerHTML = '';
    this.viewport = doc.createElement('div');
    this.viewport.className = 'blocks-viewport';
    this.container.appendChild(this.viewport);

    this.connections = new ConnectionLayer(engine, this);
    this.connections.mount(this.viewport, this._abort.signal);

    this.minimap = new Minimap(engine, this);
    if (this.options.showMinimap) {
      this.minimap.mount(this.container, this._abort.signal);
    }

    this.guides = new GuideOverlay(this);
    this.contextMenu = new ContextMenu(engine, this);
    this.linkEditor = new LinkEditorPopup(engine, this);
    this.interaction = new InteractionController(this);
    this.interaction.attach(this._abort.signal);

    // Close the popups when clicking outside of them.
    doc.addEventListener(
      'click',
      (e) => {
        if (this.contextMenu.isOpen && !this.contextMenu.contains(e.target)) {
          this.contextMenu.close();
        }
        if (!this.linkEditor.isOpen) return;
        if (this.linkEditor.contains(e.target)) return;
        if (e.target.closest && e.target.closest('.block-action.links')) return;
        this.linkEditor.close();
      },
      { signal: this._abort.signal }
    );

    this._subscribeEngine();
    this.setTheme(this.options.theme);
    if (this.options.readOnly) {
      this.container.classList.add('read-only');
    }
    this.render();
  }

  // ----------------------------------------------------------------- theme

  /**
   * Switch the colour scheme. `auto` follows the OS setting and keeps
   * following it until the theme changes again or the renderer is destroyed.
   *
   * @param {'light'|'dark'|'auto'} theme
   */
  setTheme(theme) {
    const next = theme === 'dark' || theme === 'auto' ? theme : 'light';
    this.options.theme = next;
    this._unwatchTheme();
    this.container.classList.remove('fbe-theme-dark', 'fbe-theme-auto');
    if (next === 'dark') {
      this.container.classList.add('fbe-theme-dark');
    } else if (next === 'auto') {
      this.container.classList.add('fbe-theme-auto');
      this._watchTheme();
    }
  }

  /**
   * Resolved scheme actually in effect ('light' or 'dark'), with `auto`
   * mapped through the current OS preference.
   * @returns {'light'|'dark'}
   */
  getTheme() {
    if (this.options.theme === 'auto') {
      return this._darkMediaQuery()?.matches ? 'dark' : 'light';
    }
    return this.options.theme === 'dark' ? 'dark' : 'light';
  }

  /** @returns {MediaQueryList|null} */
  _darkMediaQuery() {
    const win = this.container.ownerDocument.defaultView;
    return typeof win?.matchMedia === 'function'
      ? win.matchMedia('(prefers-color-scheme: dark)')
      : null;
  }

  /**
   * Notify `onThemeChange` when the OS preference flips. The CSS switches on
   * its own through the media query; this only exists so hosts can mirror the
   * scheme in their own chrome.
   */
  _watchTheme() {
    const query = this._darkMediaQuery();
    if (!query || typeof query.addEventListener !== 'function') return;
    this._themeQuery = query;
    this._themeListener = () => {
      if (typeof this.onThemeChange === 'function') {
        this.onThemeChange(this.getTheme());
      }
    };
    query.addEventListener('change', this._themeListener);
  }

  _unwatchTheme() {
    if (this._themeQuery && this._themeListener) {
      this._themeQuery.removeEventListener('change', this._themeListener);
    }
    this._themeQuery = null;
    this._themeListener = null;
  }

  // -------------------------------------------------------- engine events

  _sub(event, fn) {
    this.engine.on(event, fn);
    this._engineSubs.push([event, fn]);
  }

  _subscribeEngine() {
    this._sub('blockCreated', (block) => this._onBlockAdded(block));
    this._sub('blockRestored', () => this.render());
    this._sub('blockDeleted', (payload) => this._onBlockRemoved(payload));
    this._sub('blockUpdated', (block) => this._onBlockUpdated(block));
    this._sub('blockMoved', (block) => this._onBlockGeometry(block));
    this._sub('blockResized', (block) => this._onBlockGeometry(block));
    this._sub('blocksLinked', ({ from, to }) => this._onLinksChanged(from.id, to.id));
    this._sub('blocksUnlinked', ({ fromId, toId }) => this._onLinksChanged(fromId, toId));
    this._sub('linkUpdated', ({ fromId, toId }) => this._onLinksChanged(fromId, toId));
    this._sub('linksChanged', ({ fromId, toId }) => this._onLinksChanged(fromId, toId));
    this._sub('blocksImported', () => {
      this.selectedBlocks.clear();
      this.render();
    });
    this._sub('engineCleared', () => {
      this.selectedBlocks.clear();
      this.render();
    });
    this._sub('blocksArranged', () => {
      this.connections.redrawAll();
      this.minimap.update();
    });
  }

  _onBlockAdded(block) {
    const el = this._createBlockElement(block);
    this.viewport.appendChild(el);
    this.blockElements.set(block.id, el);
    this.connections.updateForBlock(block.id);
    this.cullBlock(block.id);
    this.minimap.update();
  }

  _onBlockRemoved({ id, affected = [] }) {
    this.selectedBlocks.delete(id);
    const el = this.blockElements.get(id);
    if (el) el.remove();
    this.blockElements.delete(id);
    this.connections.updateForBlock(id); // removes edges of a now-missing block
    for (const otherId of affected) {
      this._refreshChips(otherId);
    }
    if (this.linkEditor.blockId === id) {
      this.linkEditor.close();
    }
    this.minimap.update();
  }

  _onBlockUpdated(block) {
    const el = this.blockElements.get(block.id);
    if (!el) return;
    const contentEl = el.querySelector('.block-content');
    if (contentEl && !this._renderCustomContent(block, contentEl)) {
      if (el.ownerDocument.activeElement !== contentEl) {
        contentEl.textContent = block.content;
      }
    }
    const typeEl = el.querySelector('.block-type');
    if (typeEl) typeEl.textContent = block.type;
    if (this.viewMode === 'free') {
      el.style.setProperty('--fbe-z', String(block.zIndex));
    }
    this._refreshChips(block.id);
  }

  _onBlockGeometry(block) {
    this.syncBlockGeometry(block.id);
    this.cullBlock(block.id);
    this.minimap.update();
  }

  _onLinksChanged(aId, bId) {
    this._refreshChips(aId);
    this._refreshChips(bId);
    this.connections.updateForPair(aId, bId);
    if (this.linkEditor.isOpen) {
      this.linkEditor.refresh();
    }
  }

  // ------------------------------------------------------------ rendering

  /** Full re-render (used on import/clear/undo restore/mode switch). */
  render() {
    for (const el of this.blockElements.values()) {
      el.remove();
    }
    this.blockElements.clear();

    // Decide visibility before inserting: hiding blocks after they are in the
    // DOM would lay the whole board out twice.
    const bounds =
      this.options.cullOffscreen && this.viewMode === 'free' ? this._cullBounds() : null;
    const active = bounds ? this.container.ownerDocument.activeElement : null;

    for (const block of this.engine.getAllBlocks()) {
      const el = this._createBlockElement(block);
      this.blockElements.set(block.id, el);
      if (bounds) this._updateCullState(block.id, el, bounds, active);
      this.viewport.appendChild(el);
    }
    this._applySelectionClasses();

    if (this.viewMode === 'free') {
      this._applyCamera();
      this.connections.redrawAll();
    }
    if (!bounds) this.applyCulling();
    this.minimap.update();
  }

  _createBlockElement(block) {
    const doc = this.container.ownerDocument;
    const div = doc.createElement('div');
    div.className = 'block';
    div.dataset.blockId = block.id;
    if (this.selectedBlocks.has(block.id)) {
      div.classList.add('selected');
    }
    if (this.viewMode === 'free') {
      div.style.left = `${block.position.x}px`;
      div.style.top = `${block.position.y}px`;
      div.style.width = `${block.size.width}px`;
      div.style.height = `${block.size.height}px`;
      div.style.setProperty('--fbe-z', String(block.zIndex));
    }

    const header = doc.createElement('div');
    header.className = 'block-header';
    const idSpan = doc.createElement('span');
    idSpan.className = 'block-id';
    idSpan.textContent = `${block.id.slice(0, 14)}\u2026`;
    idSpan.title = block.id;
    header.appendChild(idSpan);
    div.appendChild(header);

    const actions = doc.createElement('div');
    actions.className = 'block-actions';
    const linksBtn = doc.createElement('button');
    linksBtn.className = 'block-action links';
    linksBtn.textContent = '\u{1F517}';
    linksBtn.title = 'Manage links';
    linksBtn.onclick = (e) => {
      e.stopPropagation();
      this.openLinkEditor(block.id);
    };
    const deleteBtn = doc.createElement('button');
    deleteBtn.className = 'block-action delete';
    deleteBtn.textContent = '\u00d7';
    deleteBtn.title = 'Delete block';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.deleteBlock(block.id);
    };
    actions.appendChild(linksBtn);
    actions.appendChild(deleteBtn);
    div.appendChild(actions);

    const content = doc.createElement('div');
    content.className = 'block-content';
    content.dataset.placeholder = 'Click to edit\u2026';
    if (!this._renderCustomContent(block, content)) {
      content.textContent = block.content;
      if (!this.options.readOnly) {
        content.contentEditable = 'true';
        content.addEventListener('blur', () => {
          this.engine.setBlockContent(block.id, content.textContent);
        });
        content.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            content.blur();
          }
        });
      }
    }
    content.addEventListener('pointerdown', (e) => e.stopPropagation());
    div.appendChild(content);

    const chips = this._buildChips(block);
    if (chips) div.appendChild(chips);

    const metadata = doc.createElement('div');
    metadata.className = 'block-metadata';
    metadata.textContent = `Created: ${new Date(block.metadata.createdAt).toLocaleString()}`;
    div.appendChild(metadata);

    const typeSpan = doc.createElement('span');
    typeSpan.className = 'block-type';
    typeSpan.textContent = block.type;
    div.appendChild(typeSpan);

    if (this.viewMode === 'free' && !this.options.readOnly) {
      for (const dir of ['right', 'bottom', 'corner']) {
        const handle = doc.createElement('div');
        handle.className = `resize-handle resize-handle-${dir}`;
        handle.dataset.dir = dir;
        div.appendChild(handle);
      }
    }

    return div;
  }

  /**
   * Run the custom content hook (options.renderContent). The host renders
   * into the given element (reusing or clearing it as needed) and returns
   * true to take ownership; a falsy return or a thrown error falls back to
   * the built-in plain-text rendering. Hosts injecting HTML are responsible
   * for sanitizing it.
   *
   * @param {import('./block.js').Block} block
   * @param {HTMLElement} element The `.block-content` element.
   * @returns {boolean} true when the host rendered the content.
   */
  _renderCustomContent(block, element) {
    const hook = this.options.renderContent;
    if (typeof hook !== 'function') return false;
    try {
      return hook(block, element, { readOnly: this.options.readOnly }) === true;
    } catch (error) {
      console.error('[BlockRenderer] renderContent hook failed:', error);
      return false;
    }
  }

  /** Build the "Connections:" chip list, or null when the block has none. */
  _buildChips(block) {
    const outgoing = [...block.links.entries()].map(([id, meta]) => [id, meta.type]);
    const incoming = this.engine
      .getIncomingLinks(block.id)
      .filter((b) => !block.hasLink(b.id))
      .map((b) => [b.id, 'incoming']);
    const all = [...outgoing, ...incoming];
    if (all.length === 0) return null;

    const doc = this.container.ownerDocument;
    const div = doc.createElement('div');
    div.className = 'block-links';
    const label = doc.createElement('div');
    label.className = 'block-links-label';
    label.textContent = 'Connections:';
    div.appendChild(label);

    for (const [linkId, kind] of all) {
      const linked = this.engine.getBlock(linkId);
      if (!linked) continue;
      const chip = doc.createElement('span');
      chip.className = 'block-link';
      const typeEl = doc.createElement('span');
      typeEl.className = 'block-link-type';
      typeEl.textContent = kind === 'incoming' ? '\u2190' : kind === 'double' ? '\u2194' : '\u2192';
      chip.appendChild(typeEl);
      const textEl = doc.createElement('span');
      textEl.textContent = `${linkId.slice(0, 8)}\u2026`;
      textEl.title = linked.content || linkId;
      chip.appendChild(textEl);
      chip.onclick = (e) => {
        e.stopPropagation();
        this.scrollToBlock(linkId);
      };
      div.appendChild(chip);
    }
    return div;
  }

  _refreshChips(blockId) {
    const block = this.engine.getBlock(blockId);
    const el = this.blockElements.get(blockId);
    if (!block || !el) return;
    const existing = el.querySelector('.block-links');
    const fresh = this._buildChips(block);
    if (existing && fresh) {
      existing.replaceWith(fresh);
    } else if (existing) {
      existing.remove();
    } else if (fresh) {
      el.insertBefore(fresh, el.querySelector('.block-metadata'));
    }
  }

  /** Sync a block element's position/size from the model and redraw its edges. */
  syncBlockGeometry(id) {
    const block = this.engine.getBlock(id);
    const el = this.blockElements.get(id);
    if (!block || !el) return;
    if (this.viewMode === 'free') {
      el.style.left = `${block.position.x}px`;
      el.style.top = `${block.position.y}px`;
      el.style.width = `${block.size.width}px`;
      el.style.height = `${block.size.height}px`;
    }
    this.connections.updateForBlock(id);
  }

  /** @param {string} id @returns {HTMLElement|null} */
  getBlockElement(id) {
    return this.blockElements.get(id) || null;
  }

  // -------------------------------------------------- gesture coordination

  /** Temporary position/size override used while dragging or resizing. */
  setGestureOverride(id, partial) {
    const current = this._gestureOverrides.get(id) || {};
    this._gestureOverrides.set(id, { ...current, ...partial });
  }

  getGestureOverride(id) {
    return this._gestureOverrides.get(id) || null;
  }

  clearGestureOverride(id) {
    this._gestureOverrides.delete(id);
  }

  /**
   * World-space rect of a block, including any in-flight gesture override.
   * @param {import('./block.js').Block} block
   */
  getBlockRect(block) {
    const o = this._gestureOverrides.get(block.id);
    return {
      x: o && o.x != null ? o.x : block.position.x,
      y: o && o.y != null ? o.y : block.position.y,
      width: o && o.width != null ? o.width : block.size.width,
      height: o && o.height != null ? o.height : block.size.height,
    };
  }

  // ---------------------------------------------------------------- camera

  clampZoom(zoom) {
    return Math.min(this.options.maxZoom, Math.max(this.options.minZoom, zoom));
  }

  /** @param {{x: number, y: number, zoom: number}} camera */
  setCamera(camera) {
    this.camera = { x: camera.x, y: camera.y, zoom: this.clampZoom(camera.zoom) };
    this._applyCamera();
  }

  _applyCamera() {
    if (this.viewMode !== 'free') return;
    const { x, y, zoom } = this.camera;
    this.viewport.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    const gridSize = this.engine.settings.gridSize * zoom;
    this.container.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    this.container.style.backgroundPosition = `${x}px ${y}px`;
    this.scheduleCull();
    this.minimap.update();
    if (typeof this.onCameraChange === 'function') {
      this.onCameraChange({ ...this.camera });
    }
  }

  // --------------------------------------------------------------- culling

  /** Coalesce culling passes into one per animation frame. */
  scheduleCull() {
    if (!this.options.cullOffscreen || this._cullPending || this._destroyed) return;
    this._cullPending = true;
    const win = this.container.ownerDocument.defaultView;
    const raf =
      win && typeof win.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn) => setTimeout(fn, 16);
    raf(() => {
      this._cullPending = false;
      this.applyCulling();
    });
  }

  /**
   * Visible world rect expanded by the culling margin, or null when the
   * container has no measurable size (not laid out yet, or hidden). In that
   * case nothing may be culled — otherwise the whole board would disappear.
   *
   * @returns {{left: number, top: number, right: number, bottom: number}|null}
   */
  _cullBounds() {
    if (this.container.clientWidth <= 0 || this.container.clientHeight <= 0) return null;
    const margin = this.options.cullMargin;
    const view = this.getViewRect();
    return {
      left: view.x - margin,
      top: view.y - margin,
      right: view.x + view.width + margin,
      bottom: view.y + view.height + margin,
    };
  }

  /**
   * Toggle `.fbe-offscreen` for one block.
   *
   * A block is never hidden while it is under an active gesture or while it
   * contains the focused element — that would drop the caret mid-edit.
   */
  _updateCullState(id, el, bounds, active) {
    const block = this.engine.getBlock(id);
    if (!block) return;
    const rect = this.getBlockRect(block);
    const inView =
      rect.x < bounds.right &&
      rect.x + rect.width > bounds.left &&
      rect.y < bounds.bottom &&
      rect.y + rect.height > bounds.top;
    const pinned = this._gestureOverrides.has(id) || (active !== null && el.contains(active));
    el.classList.toggle('fbe-offscreen', !inView && !pinned);
  }

  /**
   * Hide blocks that lie outside the visible world rect (plus a margin).
   * Elements stay in `blockElements`, so selection, geometry and host queries
   * are unaffected.
   */
  applyCulling() {
    if (this._destroyed) return;
    const bounds =
      this.options.cullOffscreen && this.viewMode === 'free' ? this._cullBounds() : null;
    if (!bounds) {
      for (const el of this.blockElements.values()) {
        el.classList.remove('fbe-offscreen');
      }
      return;
    }
    const active = this.container.ownerDocument.activeElement;
    for (const [id, el] of this.blockElements) {
      this._updateCullState(id, el, bounds, active);
    }
  }

  /** Re-evaluate culling for a single block (cheaper than a full pass). */
  cullBlock(id) {
    if (this._destroyed || !this.options.cullOffscreen || this.viewMode !== 'free') return;
    const el = this.blockElements.get(id);
    if (!el) return;
    const bounds = this._cullBounds();
    if (!bounds) return;
    this._updateCullState(id, el, bounds, this.container.ownerDocument.activeElement);
  }

  /**
   * Multiply zoom by a factor, keeping the given screen point stable.
   * @param {number} factor
   * @param {{clientX: number, clientY: number}} [pointer] Defaults to the container center.
   */
  zoomBy(factor, pointer) {
    const rect = this.container.getBoundingClientRect();
    const sx = pointer ? pointer.clientX - rect.left : this.container.clientWidth / 2;
    const sy = pointer ? pointer.clientY - rect.top : this.container.clientHeight / 2;
    const zoom = this.clampZoom(this.camera.zoom * factor);
    const wx = (sx - this.camera.x) / this.camera.zoom;
    const wy = (sy - this.camera.y) / this.camera.zoom;
    this.setCamera({ x: sx - wx * zoom, y: sy - wy * zoom, zoom });
  }

  /** @param {number} zoom Absolute zoom level. */
  setZoom(zoom, pointer) {
    const clamped = this.clampZoom(zoom);
    if (clamped === this.camera.zoom) return;
    this.zoomBy(clamped / this.camera.zoom, pointer);
  }

  resetView() {
    this.setCamera({ x: 0, y: 0, zoom: 1 });
  }

  /** Fit all blocks into the visible area. */
  zoomToFit(padding = 60) {
    const blocks = this.engine.getAllBlocks();
    if (blocks.length === 0) {
      this.resetView();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const block of blocks) {
      const rect = this.getBlockRect(block);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }
    const cw = this.container.clientWidth || 800;
    const ch = this.container.clientHeight || 600;
    const zoom = this.clampZoom(
      Math.min(cw / (maxX - minX + padding * 2), ch / (maxY - minY + padding * 2), 1)
    );
    this.setCamera({
      x: (cw - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (ch - (maxY - minY) * zoom) / 2 - minY * zoom,
      zoom,
    });
  }

  /** Center the camera on a world point. @param {{x: number, y: number}} world */
  centerOn(world) {
    const cw = this.container.clientWidth || 800;
    const ch = this.container.clientHeight || 600;
    const { zoom } = this.camera;
    this.setCamera({ x: cw / 2 - world.x * zoom, y: ch / 2 - world.y * zoom, zoom });
  }

  /** @param {string} id */
  centerOnBlock(id) {
    const block = this.engine.getBlock(id);
    if (!block) return;
    this.centerOn({
      x: block.position.x + block.size.width / 2,
      y: block.position.y + block.size.height / 2,
    });
  }

  /** Center on a block and flash it. @param {string} id */
  scrollToBlock(id) {
    const block = this.engine.getBlock(id);
    if (!block) return;
    this.centerOnBlock(id);
    const el = this.blockElements.get(id);
    if (el) {
      el.classList.remove('flash');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1300);
    }
  }

  /** Convert viewport (client) coordinates to world coordinates. */
  screenToWorld(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.camera.x) / this.camera.zoom,
      y: (clientY - rect.top - this.camera.y) / this.camera.zoom,
    };
  }

  /** Convert world coordinates to container-local screen coordinates. */
  worldToScreen(world) {
    return {
      x: world.x * this.camera.zoom + this.camera.x,
      y: world.y * this.camera.zoom + this.camera.y,
    };
  }

  /** Visible world rect for the current camera. */
  getViewRect() {
    const { x, y, zoom } = this.camera;
    return {
      x: -x / zoom,
      y: -y / zoom,
      width: (this.container.clientWidth || 0) / zoom,
      height: (this.container.clientHeight || 0) / zoom,
    };
  }

  // ------------------------------------------------------------- selection

  /**
   * Select a block. Plain select replaces the selection; multiSelect toggles.
   * @param {string} id
   * @param {boolean} [multiSelect]
   */
  selectBlock(id, multiSelect = false) {
    if (multiSelect) {
      if (this.selectedBlocks.has(id)) {
        this.selectedBlocks.delete(id);
      } else {
        this.selectedBlocks.add(id);
      }
    } else {
      this.selectedBlocks.clear();
      this.selectedBlocks.add(id);
    }
    if (this.selectedBlocks.has(id)) {
      this.engine.bringToFront(id);
    }
    this._applySelectionClasses();
    this.minimap.update();
  }

  clearSelection() {
    if (this.selectedBlocks.size === 0) return;
    this.selectedBlocks.clear();
    this._applySelectionClasses();
    this.minimap.update();
  }

  /**
   * Select all blocks intersecting a world-space rect (lasso).
   * @param {{x: number, y: number, width: number, height: number}} worldRect
   * @param {boolean} [additive]
   */
  selectInRect(worldRect, additive = false) {
    if (!additive) this.selectedBlocks.clear();
    for (const block of this.engine.getAllBlocks()) {
      const r = this.getBlockRect(block);
      const intersects =
        r.x < worldRect.x + worldRect.width &&
        r.x + r.width > worldRect.x &&
        r.y < worldRect.y + worldRect.height &&
        r.y + r.height > worldRect.y;
      if (intersects) this.selectedBlocks.add(block.id);
    }
    this._applySelectionClasses();
    this.minimap.update();
  }

  selectAll() {
    for (const block of this.engine.getAllBlocks()) {
      this.selectedBlocks.add(block.id);
    }
    this._applySelectionClasses();
    this.minimap.update();
  }

  _applySelectionClasses() {
    for (const [id, el] of this.blockElements) {
      el.classList.toggle('selected', this.selectedBlocks.has(id));
    }
  }

  /** @returns {import('./block.js').Block[]} */
  getSelectedBlocks() {
    return [...this.selectedBlocks].map((id) => this.engine.getBlock(id)).filter(Boolean);
  }

  // ------------------------------------------------------------ operations

  /**
   * Chain-link the selected blocks (one undo step).
   * @param {string} [linkType]
   * @returns {boolean} false when fewer than 2 blocks are selected.
   */
  linkSelected(linkType = this.options.defaultLinkType) {
    const selected = [...this.selectedBlocks];
    if (selected.length < 2) return false;
    this.engine.beginBatch('linkSelected');
    for (let i = 0; i < selected.length - 1; i++) {
      this.engine.linkBlocks(selected[i], selected[i + 1], linkType);
    }
    this.engine.endBatch();
    return true;
  }

  /** Duplicate the selected blocks and select the copies. */
  duplicateSelected() {
    const ids = [...this.selectedBlocks];
    if (ids.length === 0) return [];
    this.engine.beginBatch('duplicate');
    const copies = ids.map((id) => this.engine.duplicateBlock(id)).filter(Boolean);
    this.engine.endBatch();
    this.selectedBlocks = new Set(copies.map((c) => c.id));
    this._applySelectionClasses();
    this.minimap.update();
    return copies;
  }

  /** Delete the selected blocks (one undo step). @returns {number} count */
  deleteSelected() {
    const ids = [...this.selectedBlocks];
    if (ids.length === 0) return 0;
    this.engine.beginBatch('deleteSelected');
    for (const id of ids) {
      this.engine.deleteBlock(id);
    }
    this.engine.endBatch();
    this.selectedBlocks.clear();
    return ids.length;
  }

  /** Delete one block, honouring options.confirmDelete. @param {string} id */
  deleteBlock(id) {
    if (this.options.readOnly) return;
    if (this.options.confirmDelete) {
      const win = this.container.ownerDocument.defaultView;
      if (win && typeof win.confirm === 'function' && !win.confirm('Delete this block?')) {
        return;
      }
    }
    this.engine.deleteBlock(id);
  }

  /**
   * Enter linking mode: the next clicked block becomes the target.
   * @param {string} sourceBlockId
   * @param {string} [linkType] Defaults to options.defaultLinkType.
   */
  startLinkingMode(sourceBlockId, linkType) {
    this.interaction.startLinking(sourceBlockId, linkType);
  }

  /** @param {string} linkType 'single' | 'reverse' | 'double' */
  setDefaultLinkType(linkType) {
    if (LINK_TYPES.includes(linkType)) {
      this.options.defaultLinkType = linkType;
    }
  }

  /** Open the link management popup for a block. @param {string} blockId */
  openLinkEditor(blockId) {
    if (this.options.readOnly) return;
    this.linkEditor.openForBlock(blockId);
  }

  /** Open the editor for a single connection (edge click). */
  openEdgeEditor(fromId, toId, pointer) {
    this.linkEditor.openForEdge(fromId, toId, pointer);
  }

  /**
   * Open the context menu for whatever sits under the pointer.
   * @param {{clientX: number, clientY: number, target?: EventTarget}} pointer
   */
  openContextMenu(pointer) {
    if (!this.options.contextMenu) return;
    const node = pointer.target;
    const blockEl = node && node.closest ? node.closest('.block') : null;
    this.contextMenu.open(
      {
        type: blockEl ? 'block' : 'canvas',
        blockId: blockEl ? blockEl.dataset.blockId : null,
        world: this.screenToWorld(pointer.clientX, pointer.clientY),
      },
      pointer
    );
  }

  // ---------------------------------------------------------------- export

  /**
   * Serialize the board to standalone SVG markup, using the current theme
   * unless overridden.
   *
   * @param {object} [options] See the `exportToSVG` helper.
   * @returns {string}
   */
  exportToSVG(options = {}) {
    return exportToSVG(this.engine, { theme: this.getTheme(), ...options });
  }

  /**
   * Rasterize the board to a PNG blob (browser only).
   * @param {object} [options] See the `exportToPNG` helper.
   * @returns {Promise<Blob>}
   */
  exportToPNG(options = {}) {
    return exportToPNG(this.engine, {
      theme: this.getTheme(),
      document: this.container.ownerDocument,
      ...options,
    });
  }

  // ----------------------------------------------------------------- modes

  /** @param {'free'|'grid'} mode */
  setViewMode(mode) {
    this.viewMode = mode === 'grid' ? 'grid' : 'free';
    this.container.classList.toggle('grid-mode', this.viewMode === 'grid');
    this.linkEditor.close();
    this.interaction.cancelGesture();
    this.render();
  }

  /**
   * Enable or disable offscreen culling at runtime.
   * @param {boolean} enabled
   */
  setCullOffscreen(enabled) {
    this.options.cullOffscreen = !!enabled;
    this.applyCulling();
  }

  /** Toggle read-only mode. @param {boolean} readOnly */
  setReadOnly(readOnly) {
    this.options.readOnly = !!readOnly;
    this.container.classList.toggle('read-only', this.options.readOnly);
    this.linkEditor.close();
    this.interaction.finishLinking(null);
    this.interaction.cancelGesture();
    this.render();
  }

  // -------------------------------------------------------- compatibility

  /** Redraw all connections (legacy helper). */
  updateConnections() {
    if (this.viewMode === 'free') {
      this.connections.redrawAll();
      this.minimap.update();
    }
  }

  /** Refresh the minimap (legacy helper). */
  updateMinimap() {
    this.minimap.update();
  }

  // ------------------------------------------------------------- lifecycle

  /** Detach every listener and remove all renderer DOM. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const [event, fn] of this._engineSubs) {
      this.engine.off(event, fn);
    }
    this._engineSubs = [];
    this._abort.abort();
    this._unwatchTheme();
    this.guides.hide();
    this.contextMenu.close();
    this.linkEditor.close();
    this.minimap.destroy();
    this.connections.destroy();
    for (const el of this.blockElements.values()) {
      el.remove();
    }
    this.blockElements.clear();
    this.viewport.remove();
    this.container.classList.remove(
      'blocks-container',
      'grid-mode',
      'read-only',
      'linking',
      'panning',
      'fbe-theme-dark',
      'fbe-theme-auto'
    );
    this.container.style.backgroundSize = '';
    this.container.style.backgroundPosition = '';
  }
}
