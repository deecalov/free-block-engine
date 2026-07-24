/**
 * Free Block Engine — pointer interaction controller.
 *
 * One delegated set of Pointer Events listeners on the renderer container
 * handles every gesture: block drag (with click/drag threshold), resize,
 * lasso selection, canvas pan (space/middle button/touch), pinch zoom,
 * Ctrl+wheel zoom and the "create link" mode. Optional built-in keyboard
 * shortcuts (options.keyboardShortcuts) cover undo/redo, select all,
 * duplicate, delete and arrow-key nudging. No per-block document
 * listeners — nothing leaks between renders, and destroy() detaches
 * everything via one AbortSignal.
 *
 * @author Paul Deecalov
 * @license MIT
 */

import { findAlignment } from './snapGuides.js';

const DRAG_THRESHOLD = 4; // screen px before a press becomes a drag
const LONG_PRESS_MS = 500; // touch hold before the context menu opens

export class InteractionController {
  /** @param {import('./blockRenderer.js').BlockRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.gesture = null;
    this.linking = null;
    this.spaceDown = false;
    this._touchPoints = new Map();
    this._longPress = null;
  }

  /** @param {AbortSignal} signal */
  attach(signal) {
    const container = this.renderer.container;
    container.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    container.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    container.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    container.addEventListener('pointercancel', () => this.cancelGesture(), { signal });
    container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, signal });
    container.addEventListener('contextmenu', (e) => this.onContextMenu(e), { signal });

    const win = container.ownerDocument.defaultView;
    win.addEventListener('keydown', (e) => this.onKeyDown(e), { signal });
    win.addEventListener('keyup', (e) => this.onKeyUp(e), { signal });
  }

  // ------------------------------------------------------------- pointers

  /**
   * Right-click (and the keyboard menu key) opens the context menu.
   * @param {MouseEvent} e
   */
  onContextMenu(e) {
    const r = this.renderer;
    if (!r.options.contextMenu) return;
    e.preventDefault();
    this.cancelGesture();
    r.openContextMenu({ clientX: e.clientX, clientY: e.clientY, target: e.target });
  }

  /** Start the touch hold that stands in for a right-click. */
  _startLongPress(e) {
    const r = this.renderer;
    if (!r.options.contextMenu) return;
    this._cancelLongPress();
    const { clientX, clientY, target } = e;
    this._longPress = {
      x: clientX,
      y: clientY,
      timer: setTimeout(() => {
        this._longPress = null;
        this.cancelGesture();
        r.openContextMenu({ clientX, clientY, target });
      }, LONG_PRESS_MS),
    };
  }

  _cancelLongPress() {
    if (this._longPress) {
      clearTimeout(this._longPress.timer);
      this._longPress = null;
    }
  }

  onPointerDown(e) {
    const r = this.renderer;

    if (r.contextMenu.isOpen) {
      r.contextMenu.close();
    }

    if (this.linking) {
      const targetBlock = e.target.closest ? e.target.closest('.block') : null;
      this.finishLinking(targetBlock ? targetBlock.dataset.blockId : null);
      e.preventDefault();
      return;
    }

    if (e.pointerType === 'touch') {
      this._touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Only the first finger can hold for a menu; a second one means pinch.
      if (this._touchPoints.size === 1) {
        this._startLongPress(e);
      }
      if (this._touchPoints.size === 2 && r.viewMode === 'free') {
        this._startPinch();
        return;
      }
    }

    if (this.gesture) return;

    if (r.viewMode === 'free' && (e.button === 1 || (e.button === 0 && this.spaceDown))) {
      this._capture(e);
      this.gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, cam: { ...r.camera } };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const handle = e.target.closest ? e.target.closest('.resize-handle') : null;
    if (handle && r.viewMode === 'free' && !r.options.readOnly) {
      this._startResize(e, handle);
      return;
    }

    const blockEl = e.target.closest ? e.target.closest('.block') : null;
    if (blockEl) {
      if (e.target.closest('.block-actions') || e.target.closest('.block-link')) return;
      const blockId = blockEl.dataset.blockId;
      if (r.viewMode !== 'free' || r.options.readOnly) {
        this.gesture = { type: 'click', blockId };
        return;
      }
      this._capture(e);
      this.gesture = {
        type: 'drag',
        blockId,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        origins: null,
      };
      e.preventDefault();
      return;
    }

    // Empty canvas.
    if (r.viewMode !== 'free') {
      this.gesture = { type: 'clearSelect' };
      return;
    }
    this._capture(e);
    if (e.pointerType === 'touch') {
      this.gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, cam: { ...r.camera } };
      return;
    }
    this.gesture = {
      type: 'lasso',
      startX: e.clientX,
      startY: e.clientY,
      additive: e.ctrlKey || e.metaKey,
      moved: false,
      el: null,
    };
    e.preventDefault();
  }

  onPointerMove(e) {
    const r = this.renderer;

    if (this.linking) {
      r.connections.showLinkingLine(
        this.linking.sourcePoint,
        r.screenToWorld(e.clientX, e.clientY)
      );
    }

    // A moving finger is a drag or a pan, not a long press.
    if (this._longPress) {
      const moved = Math.hypot(e.clientX - this._longPress.x, e.clientY - this._longPress.y);
      if (moved > DRAG_THRESHOLD) this._cancelLongPress();
    }

    if (e.pointerType === 'touch' && this._touchPoints.has(e.pointerId)) {
      this._touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.gesture && this.gesture.type === 'pinch') {
        this._movePinch();
        return;
      }
    }

    const g = this.gesture;
    if (!g) return;

    switch (g.type) {
      case 'pan':
        r.setCamera({
          x: g.cam.x + (e.clientX - g.startX),
          y: g.cam.y + (e.clientY - g.startY),
          zoom: g.cam.zoom,
        });
        break;
      case 'drag':
        this._moveDrag(g, e);
        break;
      case 'resize':
        this._moveResize(g, e);
        break;
      case 'lasso':
        this._moveLasso(g, e);
        break;
    }
  }

  onPointerUp(e) {
    this._cancelLongPress();
    if (e.pointerType === 'touch') {
      this._touchPoints.delete(e.pointerId);
      if (this.gesture && this.gesture.type === 'pinch') {
        if (this._touchPoints.size < 2) this.gesture = null;
        return;
      }
    }

    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    this._release(e);

    const r = this.renderer;
    switch (g.type) {
      case 'click':
        r.selectBlock(g.blockId, e.ctrlKey || e.metaKey);
        break;
      case 'clearSelect':
        r.clearSelection();
        break;
      case 'drag':
        this._endDrag(g, e);
        break;
      case 'resize':
        this._endResize(g);
        break;
      case 'lasso':
        this._endLasso(g, e);
        break;
    }
  }

  onWheel(e) {
    const r = this.renderer;
    if (r.viewMode !== 'free') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      r.zoomBy(factor, { clientX: e.clientX, clientY: e.clientY });
    } else {
      r.setCamera({
        x: r.camera.x - e.deltaX,
        y: r.camera.y - e.deltaY,
        zoom: r.camera.zoom,
      });
    }
  }

  // ------------------------------------------------------------- keyboard

  onKeyDown(e) {
    const editable = this._isEditableTarget(e.target);
    if (e.code === 'Space') {
      if (!editable) {
        this.spaceDown = true;
        this.renderer.container.classList.add('panning');
        if (e.target === e.target.ownerDocument?.body) e.preventDefault();
      }
      return;
    }
    if (e.key === 'Escape') {
      this.cancelAll();
      return;
    }
    if (this.renderer.options.keyboardShortcuts && !editable) {
      this._handleShortcut(e);
    }
  }

  /** @param {EventTarget|null} t @returns {boolean} */
  _isEditableTarget(t) {
    return Boolean(
      t &&
      (t.isContentEditable ||
        t.tagName === 'INPUT' ||
        t.tagName === 'TEXTAREA' ||
        t.tagName === 'SELECT')
    );
  }

  /**
   * Built-in hotkeys (options.keyboardShortcuts): Ctrl/Cmd+Z — undo,
   * Ctrl+Y / Ctrl+Shift+Z — redo, Ctrl+A — select all, Ctrl+D — duplicate,
   * Delete/Backspace — delete the selection, arrow keys — nudge the
   * selection by gridSize (Shift: by 1px without snapping).
   *
   * @param {KeyboardEvent} e
   */
  _handleShortcut(e) {
    const r = this.renderer;
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && key === 'a') {
      e.preventDefault();
      r.selectAll();
      return;
    }
    if (r.options.readOnly) return;
    if (ctrl && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      r.engine.undo();
    } else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      r.engine.redo();
    } else if (ctrl && key === 'd') {
      e.preventDefault();
      r.duplicateSelected();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !ctrl) {
      this._deleteSelection(e);
    } else if (e.key.startsWith('Arrow') && !ctrl) {
      this._nudgeSelection(e);
    }
  }

  /** Delete the selected blocks, honouring options.confirmDelete. */
  _deleteSelection(e) {
    const r = this.renderer;
    const count = r.selectedBlocks.size;
    if (count === 0) return;
    e.preventDefault();
    if (r.options.confirmDelete) {
      const win = r.container.ownerDocument.defaultView;
      const question = count === 1 ? 'Delete this block?' : `Delete ${count} blocks?`;
      if (win && typeof win.confirm === 'function' && !win.confirm(question)) return;
    }
    r.deleteSelected();
  }

  /** Move the selection with arrow keys (Shift: 1px, no grid snap). */
  _nudgeSelection(e) {
    const r = this.renderer;
    if (r.selectedBlocks.size === 0 || r.viewMode !== 'free') return;
    const step = e.shiftKey ? 1 : r.engine.settings.gridSize;
    const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
    const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
    if (dx === 0 && dy === 0) return;
    e.preventDefault();
    const ids = [...r.selectedBlocks];
    if (ids.length > 1) r.engine.beginBatch('nudgeBlocks');
    for (const id of ids) {
      const block = r.engine.getBlock(id);
      if (block) {
        r.engine.setBlockPosition(id, block.position.x + dx, block.position.y + dy, !e.shiftKey);
      }
    }
    if (ids.length > 1) r.engine.endBatch();
  }

  onKeyUp(e) {
    if (e.code === 'Space') {
      this.spaceDown = false;
      this.renderer.container.classList.remove('panning');
    }
  }

  /** Escape: cancel any gesture/linking, close popups, clear selection. */
  cancelAll() {
    const hadLinking = this.linking !== null;
    if (hadLinking) this.finishLinking(null);
    const hadGesture = this.gesture !== null;
    this.cancelGesture();
    const r = this.renderer;
    if (r.contextMenu.isOpen) {
      r.contextMenu.close();
      return;
    }
    if (r.linkEditor.isOpen) {
      r.linkEditor.close();
    } else if (!hadLinking && !hadGesture) {
      r.clearSelection();
    }
  }

  // ------------------------------------------------------------------ drag

  _moveDrag(g, e) {
    const r = this.renderer;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      if (!r.selectedBlocks.has(g.blockId)) {
        r.selectBlock(g.blockId, false);
      } else {
        r.engine.bringToFront(g.blockId);
      }
      g.origins = new Map();
      for (const id of r.selectedBlocks) {
        const block = r.engine.getBlock(id);
        if (block) g.origins.set(id, { ...block.position });
      }
      for (const id of g.origins.keys()) {
        const el = r.getBlockElement(id);
        if (el) el.classList.add('dragging');
      }
    }

    const zoom = r.camera.zoom;
    const snap = this._alignDrag(g, dx / zoom, dy / zoom);
    for (const [id, origin] of g.origins) {
      const nx = origin.x + dx / zoom + snap.dx;
      const ny = origin.y + dy / zoom + snap.dy;
      r.setGestureOverride(id, { x: nx, y: ny });
      const el = r.getBlockElement(id);
      if (el) {
        el.style.left = `${nx}px`;
        el.style.top = `${ny}px`;
      }
      r.connections.updateForBlock(id);
    }
    r.minimap.update();
  }

  /**
   * Alignment correction for the current drag, or a zero offset when the
   * feature is off. Guides are drawn as a side effect.
   *
   * @param {object} g The drag gesture state.
   * @param {number} worldDx Pointer delta in world units.
   * @param {number} worldDy Pointer delta in world units.
   * @returns {{dx: number, dy: number}}
   */
  _alignDrag(g, worldDx, worldDy) {
    const r = this.renderer;
    g.snapped = false;
    if (!r.options.snapGuides) return { dx: 0, dy: 0 };

    const lead = r.engine.getBlock(g.blockId);
    const origin = g.origins.get(g.blockId);
    if (!lead || !origin) return { dx: 0, dy: 0 };

    const moving = {
      x: origin.x + worldDx,
      y: origin.y + worldDy,
      width: lead.size.width,
      height: lead.size.height,
    };
    const others = [];
    for (const block of r.engine.getAllBlocks()) {
      if (!g.origins.has(block.id)) others.push(r.getBlockRect(block));
    }

    const alignment = findAlignment(moving, others, r.options.snapThreshold / r.camera.zoom);
    r.guides.show(alignment);
    g.snapped = alignment.dx !== 0 || alignment.dy !== 0;
    return { dx: alignment.dx, dy: alignment.dy };
  }

  _endDrag(g, e) {
    const r = this.renderer;
    r.guides.hide();
    if (!g.moved) {
      r.selectBlock(g.blockId, e.ctrlKey || e.metaKey);
      return;
    }
    // Grid snapping would immediately undo an alignment to a neighbour that
    // does not sit on the grid, so the snapped position is committed as-is.
    const snapToGrid = !g.snapped;
    const ids = [...g.origins.keys()];
    if (ids.length > 1) r.engine.beginBatch('moveBlocks');
    for (const id of ids) {
      const override = r.getGestureOverride(id);
      r.clearGestureOverride(id);
      const el = r.getBlockElement(id);
      if (el) el.classList.remove('dragging');
      if (override) r.engine.setBlockPosition(id, override.x, override.y, snapToGrid);
      r.syncBlockGeometry(id);
    }
    if (ids.length > 1) r.engine.endBatch();
    r.minimap.update();
  }

  // ---------------------------------------------------------------- resize

  _startResize(e, handle) {
    const r = this.renderer;
    const blockEl = handle.closest('.block');
    const block = blockEl ? r.engine.getBlock(blockEl.dataset.blockId) : null;
    if (!block) return;
    this._capture(e);
    blockEl.classList.add('resizing');
    handle.classList.add('active');
    this.gesture = {
      type: 'resize',
      blockId: block.id,
      dir: handle.dataset.dir,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: block.size.width,
      startHeight: block.size.height,
      handle,
      el: blockEl,
    };
    e.preventDefault();
  }

  _moveResize(g, e) {
    const r = this.renderer;
    const zoom = r.camera.zoom;
    const dx = (e.clientX - g.startX) / zoom;
    const dy = (e.clientY - g.startY) / zoom;
    let width = g.startWidth;
    let height = g.startHeight;
    if (g.dir === 'right' || g.dir === 'corner') {
      width = Math.max(r.engine.settings.minBlockWidth, g.startWidth + dx);
    }
    if (g.dir === 'bottom' || g.dir === 'corner') {
      height = Math.max(r.engine.settings.minBlockHeight, g.startHeight + dy);
    }
    r.setGestureOverride(g.blockId, { width, height });
    g.el.style.width = `${width}px`;
    g.el.style.height = `${height}px`;
    r.connections.updateForBlock(g.blockId);
  }

  _endResize(g) {
    const r = this.renderer;
    g.handle.classList.remove('active');
    g.el.classList.remove('resizing');
    const override = r.getGestureOverride(g.blockId);
    r.clearGestureOverride(g.blockId);
    if (override && override.width != null) {
      r.engine.setBlockSize(g.blockId, override.width, override.height);
    }
    r.syncBlockGeometry(g.blockId);
    r.minimap.update();
  }

  // ----------------------------------------------------------------- lasso

  _moveLasso(g, e) {
    const r = this.renderer;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      g.moved = true;
      g.el = r.container.ownerDocument.createElement('div');
      g.el.className = 'fbe-lasso';
      r.container.appendChild(g.el);
    }
    const rect = r.container.getBoundingClientRect();
    g.el.style.left = `${Math.min(g.startX, e.clientX) - rect.left}px`;
    g.el.style.top = `${Math.min(g.startY, e.clientY) - rect.top}px`;
    g.el.style.width = `${Math.abs(dx)}px`;
    g.el.style.height = `${Math.abs(dy)}px`;
  }

  _endLasso(g, e) {
    const r = this.renderer;
    if (g.el) g.el.remove();
    if (!g.moved) {
      if (!g.additive) r.clearSelection();
      return;
    }
    const a = r.screenToWorld(g.startX, g.startY);
    const b = r.screenToWorld(e.clientX, e.clientY);
    r.selectInRect(
      {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      },
      g.additive
    );
  }

  // ----------------------------------------------------------------- pinch

  _startPinch() {
    this.cancelGesture();
    const pts = [...this._touchPoints.values()];
    const r = this.renderer;
    this.gesture = {
      type: 'pinch',
      startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      startMid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 },
      startCam: { ...r.camera },
    };
  }

  _movePinch() {
    const g = this.gesture;
    const pts = [...this._touchPoints.values()];
    if (pts.length < 2) return;
    const r = this.renderer;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const zoom = r.clampZoom(g.startCam.zoom * (dist / g.startDist));
    const rect = r.container.getBoundingClientRect();
    const wx = (g.startMid.x - rect.left - g.startCam.x) / g.startCam.zoom;
    const wy = (g.startMid.y - rect.top - g.startCam.y) / g.startCam.zoom;
    r.setCamera({
      x: mid.x - rect.left - wx * zoom,
      y: mid.y - rect.top - wy * zoom,
      zoom,
    });
  }

  // --------------------------------------------------------------- linking

  /**
   * Enter "create link" mode: a dashed line follows the pointer until the
   * user clicks a target block (or presses Escape / clicks empty canvas).
   *
   * @param {string} sourceId
   * @param {string} [linkType]
   */
  startLinking(sourceId, linkType) {
    const r = this.renderer;
    if (r.options.readOnly || r.viewMode !== 'free') return;
    const block = r.engine.getBlock(sourceId);
    if (!block) return;
    this.finishLinking(null);
    const sourcePoint = {
      x: block.position.x + block.size.width / 2,
      y: block.position.y + block.size.height / 2,
    };
    this.linking = { sourceId, linkType: linkType ?? r.options.defaultLinkType, sourcePoint };
    r.container.classList.add('linking');
    const el = r.getBlockElement(sourceId);
    if (el) el.classList.add('linking-source');
    r.connections.showLinkingLine(sourcePoint, sourcePoint);
  }

  /** @param {string|null} targetId Target block id or null to cancel. */
  finishLinking(targetId) {
    const linking = this.linking;
    this.linking = null;
    if (!linking) return;
    const r = this.renderer;
    r.container.classList.remove('linking');
    const el = r.getBlockElement(linking.sourceId);
    if (el) el.classList.remove('linking-source');
    r.connections.hideLinkingLine();
    if (targetId && targetId !== linking.sourceId) {
      r.engine.linkBlocks(linking.sourceId, targetId, linking.linkType);
    }
  }

  // ----------------------------------------------------------------- misc

  /** Abort the in-flight gesture and restore visual state. */
  cancelGesture() {
    this._cancelLongPress();
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    const r = this.renderer;
    r.guides.hide();
    if (g.type === 'drag' && g.origins) {
      for (const id of g.origins.keys()) {
        r.clearGestureOverride(id);
        const el = r.getBlockElement(id);
        if (el) el.classList.remove('dragging');
        r.syncBlockGeometry(id);
      }
      r.minimap.update();
    } else if (g.type === 'resize') {
      g.handle.classList.remove('active');
      g.el.classList.remove('resizing');
      r.clearGestureOverride(g.blockId);
      r.syncBlockGeometry(g.blockId);
    } else if (g.type === 'lasso' && g.el) {
      g.el.remove();
    }
  }

  _capture(e) {
    const container = this.renderer.container;
    if (container.setPointerCapture) {
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        /* unsupported environment (jsdom) */
      }
    }
  }

  _release(e) {
    const container = this.renderer.container;
    if (container.releasePointerCapture) {
      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        /* unsupported environment (jsdom) */
      }
    }
  }
}
