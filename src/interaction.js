/**
 * Free Block Engine — pointer interaction controller.
 *
 * One delegated set of Pointer Events listeners on the renderer container
 * handles every gesture: block drag (with click/drag threshold), resize,
 * lasso selection, canvas pan (space/middle button/touch), pinch zoom,
 * Ctrl+wheel zoom and the "create link" mode. No per-block document
 * listeners — nothing leaks between renders, and destroy() detaches
 * everything via one AbortSignal.
 *
 * @author Paul Deecalov
 * @license MIT
 */

const DRAG_THRESHOLD = 4; // screen px before a press becomes a drag

export class InteractionController {
  /** @param {import('./blockRenderer.js').BlockRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.gesture = null;
    this.linking = null;
    this.spaceDown = false;
    this._touchPoints = new Map();
  }

  /** @param {AbortSignal} signal */
  attach(signal) {
    const container = this.renderer.container;
    container.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    container.addEventListener('pointermove', (e) => this.onPointerMove(e), { signal });
    container.addEventListener('pointerup', (e) => this.onPointerUp(e), { signal });
    container.addEventListener('pointercancel', () => this.cancelGesture(), { signal });
    container.addEventListener('wheel', (e) => this.onWheel(e), { passive: false, signal });

    const win = container.ownerDocument.defaultView;
    win.addEventListener('keydown', (e) => this.onKeyDown(e), { signal });
    win.addEventListener('keyup', (e) => this.onKeyUp(e), { signal });
  }

  // ------------------------------------------------------------- pointers

  onPointerDown(e) {
    const r = this.renderer;

    if (this.linking) {
      const targetBlock = e.target.closest ? e.target.closest('.block') : null;
      this.finishLinking(targetBlock ? targetBlock.dataset.blockId : null);
      e.preventDefault();
      return;
    }

    if (e.pointerType === 'touch') {
      this._touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    if (e.code === 'Space') {
      const t = e.target;
      const editable =
        t &&
        (t.isContentEditable ||
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT');
      if (!editable) {
        this.spaceDown = true;
        this.renderer.container.classList.add('panning');
        if (t === t.ownerDocument.body) e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      this.cancelAll();
    }
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
    for (const [id, origin] of g.origins) {
      const nx = origin.x + dx / zoom;
      const ny = origin.y + dy / zoom;
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

  _endDrag(g, e) {
    const r = this.renderer;
    if (!g.moved) {
      r.selectBlock(g.blockId, e.ctrlKey || e.metaKey);
      return;
    }
    const ids = [...g.origins.keys()];
    if (ids.length > 1) r.engine.beginBatch('moveBlocks');
    for (const id of ids) {
      const override = r.getGestureOverride(id);
      r.clearGestureOverride(id);
      const el = r.getBlockElement(id);
      if (el) el.classList.remove('dragging');
      if (override) r.engine.setBlockPosition(id, override.x, override.y);
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
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    const r = this.renderer;
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
