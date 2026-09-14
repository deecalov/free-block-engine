/**
 * Free Block Engine — SVG connection layer.
 *
 * Draws curved edges between linked blocks in world coordinates (the layer
 * lives inside the transformed viewport, so zoom/pan come for free).
 * Edges carry arrow markers per link type, optional labels, and are
 * clickable to open the link editor.
 *
 * Every edge is indexed by its canonical pair key and by the two blocks it
 * touches, so moving a block relayouts only its own edges, in place — no
 * DOM query over every edge per pointer move. With offscreen culling the
 * renderer hands the layer its cull bounds and edges outside them are
 * hidden the same way blocks are.
 *
 * @author Paul Deecalov
 * @license MIT
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

let instanceCounter = 0;

/**
 * Best exit point on the border of sourceRect towards targetRect.
 * Pure math in world coordinates; guards against degenerate geometry.
 *
 * @param {{x: number, y: number, width: number, height: number}} sourceRect
 * @param {{x: number, y: number, width: number, height: number}} targetRect
 * @returns {{x: number, y: number}}
 */
export function connectionPoint(sourceRect, targetRect) {
  const scx = sourceRect.x + sourceRect.width / 2;
  const scy = sourceRect.y + sourceRect.height / 2;
  const tcx = targetRect.x + targetRect.width / 2;
  const tcy = targetRect.y + targetRect.height / 2;
  const dx = tcx - scx;
  const dy = tcy - scy;

  if (dx === 0 && dy === 0) {
    return { x: sourceRect.x + sourceRect.width, y: scy };
  }

  const widthRatio = Math.abs(dx) / sourceRect.width;
  const heightRatio = Math.abs(dy) / sourceRect.height;
  let x;
  let y;

  if (widthRatio > heightRatio) {
    const sign = Math.sign(dx);
    x = scx + sign * (sourceRect.width / 2);
    y = scy + dy * ((sign * (sourceRect.width / 2)) / dx);
  } else {
    const sign = Math.sign(dy);
    y = scy + sign * (sourceRect.height / 2);
    x = scx + dx * ((sign * (sourceRect.height / 2)) / dy);
  }

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: scx, y: scy };
  }
  return { x, y };
}

/** Point on a cubic bezier at parameter t. */
function cubicPoint(t, p0, p1, p2, p3) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Canonical key of an unordered block pair. */
function pairKey(aId, bId) {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

/**
 * @typedef {object} EdgeRecord
 * @property {string} key Canonical pair key.
 * @property {string} from Source block id (canonical direction).
 * @property {string} to Target block id.
 * @property {'single'|'double'} type Render type.
 * @property {SVGGElement} group
 * @property {SVGPathElement} hit Wide invisible path for clicking.
 * @property {SVGPathElement} path Visible curve.
 * @property {SVGCircleElement|null} dot Source dot of single links.
 * @property {SVGTextElement|null} label Label element, when the link has one.
 * @property {{left: number, top: number, right: number, bottom: number}} bounds
 *   World-space box used for culling.
 */

export class ConnectionLayer {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {import('./blockRenderer.js').BlockRenderer} renderer
   */
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.svg = null;
    this._linkLine = null;
    this._id = ++instanceCounter;
    /** @type {Map<string, EdgeRecord>} pair key → edge */
    this._edges = new Map();
    /** @type {Map<string, Map<string, string>>} block id → (pair key → other block id) */
    this._byBlock = new Map();
  }

  /** @param {string} type */
  markerId(type) {
    return `fbe-arrow-${type}-${this._id}`;
  }

  /** Number of edges currently drawn. */
  get size() {
    return this._edges.size;
  }

  /**
   * Create the SVG layer inside the viewport element.
   * @param {HTMLElement} viewportEl
   * @param {AbortSignal} signal
   */
  mount(viewportEl, signal) {
    const doc = viewportEl.ownerDocument;
    this.svg = doc.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('class', 'connections-layer');

    const defs = doc.createElementNS(SVG_NS, 'defs');
    for (const type of ['single', 'double']) {
      const marker = doc.createElementNS(SVG_NS, 'marker');
      marker.setAttribute('id', this.markerId(type));
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '7');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('orient', 'auto-start-reverse');
      const arrow = doc.createElementNS(SVG_NS, 'path');
      arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
      arrow.setAttribute(
        'class',
        type === 'double' ? 'fbe-marker fbe-marker-double' : 'fbe-marker'
      );
      marker.appendChild(arrow);
      defs.appendChild(marker);
    }
    this.svg.appendChild(defs);
    viewportEl.appendChild(this.svg);

    this.svg.addEventListener(
      'click',
      (e) => {
        if (this.renderer.options.readOnly) return;
        const edge = e.target.closest ? e.target.closest('.fbe-edge') : null;
        if (!edge) return;
        e.stopPropagation();
        this.renderer.openEdgeEditor(edge.dataset.from, edge.dataset.to, {
          clientX: e.clientX,
          clientY: e.clientY,
        });
      },
      { signal }
    );
  }

  destroy() {
    this._edges.clear();
    this._byBlock.clear();
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this._linkLine = null;
  }

  /** Remove all edges, keeping defs and the temporary linking line. */
  clear() {
    for (const record of this._edges.values()) {
      record.group.remove();
    }
    this._edges.clear();
    this._byBlock.clear();
  }

  /** Redraw every connection. */
  redrawAll() {
    if (!this.svg) return;
    this.clear();
    for (const block of this.engine.getAllBlocks()) {
      for (const targetId of block.links.keys()) {
        if (!this._edges.has(pairKey(block.id, targetId))) {
          this._drawPair(block.id, targetId);
        }
      }
    }
  }

  /**
   * Relayout the connections touching one block (drag/resize/delete). Edges
   * already drawn come from the index; links not drawn yet from the model.
   * @param {string} blockId
   */
  updateForBlock(blockId) {
    if (!this.svg) return;
    const pairs = new Map(this._byBlock.get(blockId) ?? []);
    const block = this.engine.getBlock(blockId);
    if (block) {
      for (const targetId of block.links.keys()) {
        pairs.set(pairKey(blockId, targetId), targetId);
      }
      for (const source of this.engine.getIncomingLinks(blockId)) {
        pairs.set(pairKey(blockId, source.id), source.id);
      }
    }
    for (const otherId of pairs.values()) {
      this._drawPair(blockId, otherId);
    }
  }

  /**
   * Redraw the connection between one pair of blocks.
   * @param {string} aId
   * @param {string} bId
   */
  updateForPair(aId, bId) {
    if (!this.svg) return;
    this._drawPair(aId, bId);
  }

  /**
   * Hide the edges lying outside a world-space rect; null shows them all.
   * @param {{left: number, top: number, right: number, bottom: number}|null} bounds
   */
  applyCulling(bounds) {
    for (const record of this._edges.values()) {
      this._cull(record, bounds);
    }
  }

  _cull(record, bounds) {
    const b = record.bounds;
    const visible =
      !bounds ||
      (b.left < bounds.right &&
        b.right > bounds.left &&
        b.top < bounds.bottom &&
        b.bottom > bounds.top);
    record.group.classList.toggle('fbe-offscreen', !visible);
  }

  /**
   * Bring the edge of a pair in line with the model: create it, relayout it
   * in place, rebuild it when its direction or type changed, or drop it when
   * the link (or a block) is gone.
   */
  _drawPair(aId, bId) {
    const key = pairKey(aId, bId);
    const existing = this._edges.get(key) || null;
    const info = this.engine.getLinkInfo(aId, bId);
    const fromBlock = info ? this.engine.getBlock(info.from) : null;
    const toBlock = info ? this.engine.getBlock(info.to) : null;
    if (!info || !fromBlock || !toBlock) {
      if (existing) this._removeEdge(existing);
      return;
    }
    const renderType = info.type === 'double' ? 'double' : 'single';
    let record = existing;
    if (
      record &&
      (record.from !== info.from || record.to !== info.to || record.type !== renderType)
    ) {
      this._removeEdge(record);
      record = null;
    }
    if (!record) {
      record = this._createEdge(key, fromBlock.id, toBlock.id, renderType);
    }
    this._layoutEdge(record, fromBlock, toBlock, info.label);
  }

  /** @returns {EdgeRecord} */
  _createEdge(key, fromId, toId, renderType) {
    const doc = this.svg.ownerDocument;
    const group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'fbe-edge');
    group.dataset.from = fromId;
    group.dataset.to = toId;
    group.dataset.type = renderType;

    const hit = doc.createElementNS(SVG_NS, 'path');
    hit.setAttribute('class', 'edge-hit');
    group.appendChild(hit);

    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute('marker-end', `url(#${this.markerId(renderType)})`);
    if (renderType === 'double') {
      path.setAttribute('marker-start', `url(#${this.markerId(renderType)})`);
    }
    group.appendChild(path);

    let dot = null;
    if (renderType === 'single') {
      dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'edge-dot');
      dot.setAttribute('r', '4');
      group.appendChild(dot);
    }

    this.svg.appendChild(group);
    const record = {
      key,
      from: fromId,
      to: toId,
      type: renderType,
      group,
      hit,
      path,
      dot,
      label: null,
      bounds: { left: 0, top: 0, right: 0, bottom: 0 },
    };
    this._edges.set(key, record);
    this._index(fromId, key, toId);
    this._index(toId, key, fromId);
    return record;
  }

  _index(blockId, key, otherId) {
    let pairs = this._byBlock.get(blockId);
    if (!pairs) {
      pairs = new Map();
      this._byBlock.set(blockId, pairs);
    }
    pairs.set(key, otherId);
  }

  _unindex(blockId, key) {
    const pairs = this._byBlock.get(blockId);
    if (!pairs) return;
    pairs.delete(key);
    if (pairs.size === 0) this._byBlock.delete(blockId);
  }

  /** @param {EdgeRecord} record */
  _removeEdge(record) {
    record.group.remove();
    this._edges.delete(record.key);
    this._unindex(record.from, record.key);
    this._unindex(record.to, record.key);
  }

  /**
   * Compute the curve for the current block geometry and write it into the
   * existing elements.
   *
   * @param {EdgeRecord} record
   * @param {import('./block.js').Block} fromBlock
   * @param {import('./block.js').Block} toBlock
   * @param {string} label
   */
  _layoutEdge(record, fromBlock, toBlock, label) {
    const sourceRect = this.renderer.getBlockRect(fromBlock);
    const targetRect = this.renderer.getBlockRect(toBlock);
    const p1 = connectionPoint(sourceRect, targetRect);
    const p2 = connectionPoint(targetRect, sourceRect);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(distance / 3, 100);

    let cp1;
    let cp2;
    if (Math.abs(dx) > Math.abs(dy)) {
      cp1 = { x: p1.x + Math.sign(dx) * offset, y: p1.y };
      cp2 = { x: p2.x - Math.sign(dx) * offset, y: p2.y };
    } else {
      cp1 = { x: p1.x, y: p1.y + Math.sign(dy) * offset };
      cp2 = { x: p2.x, y: p2.y - Math.sign(dy) * offset };
    }

    const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
    record.hit.setAttribute('d', d);
    record.path.setAttribute('d', d);
    if (record.dot) {
      record.dot.setAttribute('cx', String(p1.x));
      record.dot.setAttribute('cy', String(p1.y));
    }

    if (label) {
      if (!record.label) {
        record.label = this.svg.ownerDocument.createElementNS(SVG_NS, 'text');
        record.label.setAttribute('class', 'edge-label');
        record.group.appendChild(record.label);
      }
      const mid = cubicPoint(0.5, p1, cp1, cp2, p2);
      record.label.setAttribute('x', String(mid.x));
      record.label.setAttribute('y', String(mid.y - 6));
      if (record.label.textContent !== label) record.label.textContent = label;
    } else if (record.label) {
      record.label.remove();
      record.label = null;
    }

    // A cubic curve stays inside the hull of its control points; pad for the
    // markers and the (estimated) label width.
    const padX = 12 + (label ? label.length * 4 : 0);
    const padY = 20;
    record.bounds = {
      left: Math.min(p1.x, p2.x, cp1.x, cp2.x) - padX,
      top: Math.min(p1.y, p2.y, cp1.y, cp2.y) - padY,
      right: Math.max(p1.x, p2.x, cp1.x, cp2.x) + padX,
      bottom: Math.max(p1.y, p2.y, cp1.y, cp2.y) + padY,
    };
    this._cull(record, this.renderer.getCullBounds());
  }

  /**
   * Show/update the dashed line used while creating a new connection.
   * @param {{x: number, y: number}} p1 World coordinates.
   * @param {{x: number, y: number}} p2 World coordinates.
   */
  showLinkingLine(p1, p2) {
    if (!this.svg) return;
    if (!this._linkLine) {
      this._linkLine = this.svg.ownerDocument.createElementNS(SVG_NS, 'line');
      this._linkLine.setAttribute('class', 'linking-line');
      this.svg.appendChild(this._linkLine);
    }
    this._linkLine.setAttribute('x1', String(p1.x));
    this._linkLine.setAttribute('y1', String(p1.y));
    this._linkLine.setAttribute('x2', String(p2.x));
    this._linkLine.setAttribute('y2', String(p2.y));
  }

  /** Remove the temporary linking line. */
  hideLinkingLine() {
    if (this._linkLine) {
      this._linkLine.remove();
      this._linkLine = null;
    }
  }
}
