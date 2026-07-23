/**
 * Free Block Engine — SVG connection layer.
 *
 * Draws curved edges between linked blocks in world coordinates (the layer
 * lives inside the transformed viewport, so zoom/pan come for free).
 * Edges carry arrow markers per link type, optional labels, and are
 * clickable to open the link editor.
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
  }

  /** @param {string} type */
  markerId(type) {
    return `fbe-arrow-${type}-${this._id}`;
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
    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }
    this._linkLine = null;
  }

  /** Remove all edges, keeping defs and the temporary linking line. */
  clear() {
    if (!this.svg) return;
    for (const g of [...this.svg.querySelectorAll('.fbe-edge')]) {
      g.remove();
    }
  }

  /** Redraw every connection. */
  redrawAll() {
    if (!this.svg) return;
    this.clear();
    const seen = new Set();
    for (const block of this.engine.getAllBlocks()) {
      for (const targetId of block.links.keys()) {
        const key = block.id < targetId ? `${block.id}|${targetId}` : `${targetId}|${block.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        this._drawPair(block.id, targetId);
      }
    }
  }

  /**
   * Redraw only the connections touching one block (used during drag/resize).
   * @param {string} blockId
   */
  updateForBlock(blockId) {
    if (!this.svg) return;
    for (const g of [...this.svg.querySelectorAll('.fbe-edge')]) {
      if (g.dataset.from === blockId || g.dataset.to === blockId) {
        g.remove();
      }
    }
    const block = this.engine.getBlock(blockId);
    if (!block) return;
    const seen = new Set();
    for (const targetId of block.links.keys()) {
      seen.add(targetId);
      this._drawPair(blockId, targetId);
    }
    for (const source of this.engine.getIncomingLinks(blockId)) {
      if (!seen.has(source.id)) {
        this._drawPair(blockId, source.id);
      }
    }
  }

  /**
   * Redraw the connection between one pair of blocks.
   * @param {string} aId
   * @param {string} bId
   */
  updateForPair(aId, bId) {
    if (!this.svg) return;
    for (const g of [...this.svg.querySelectorAll('.fbe-edge')]) {
      const { from, to } = g.dataset;
      if ((from === aId && to === bId) || (from === bId && to === aId)) {
        g.remove();
      }
    }
    this._drawPair(aId, bId);
  }

  _drawPair(aId, bId) {
    const info = this.engine.getLinkInfo(aId, bId);
    if (!info) return;
    const fromBlock = this.engine.getBlock(info.from);
    const toBlock = this.engine.getBlock(info.to);
    if (!fromBlock || !toBlock) return;
    const renderType = info.type === 'double' ? 'double' : 'single';
    this._drawEdge(fromBlock, toBlock, renderType, info.label);
  }

  /**
   * @param {import('./block.js').Block} fromBlock
   * @param {import('./block.js').Block} toBlock
   * @param {'single'|'double'} renderType
   * @param {string} label
   */
  _drawEdge(fromBlock, toBlock, renderType, label) {
    const doc = this.svg.ownerDocument;
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

    const group = doc.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'fbe-edge');
    group.dataset.from = fromBlock.id;
    group.dataset.to = toBlock.id;
    group.dataset.type = renderType;

    const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;

    const hit = doc.createElementNS(SVG_NS, 'path');
    hit.setAttribute('class', 'edge-hit');
    hit.setAttribute('d', d);
    group.appendChild(hit);

    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'edge-path');
    path.setAttribute('d', d);
    path.setAttribute('marker-end', `url(#${this.markerId(renderType)})`);
    if (renderType === 'double') {
      path.setAttribute('marker-start', `url(#${this.markerId(renderType)})`);
    }
    group.appendChild(path);

    if (renderType === 'single') {
      const dot = doc.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'edge-dot');
      dot.setAttribute('cx', String(p1.x));
      dot.setAttribute('cy', String(p1.y));
      dot.setAttribute('r', '4');
      group.appendChild(dot);
    }

    if (label) {
      const mid = cubicPoint(0.5, p1, cp1, cp2, p2);
      const text = doc.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'edge-label');
      text.setAttribute('x', String(mid.x));
      text.setAttribute('y', String(mid.y - 6));
      text.textContent = label;
      group.appendChild(text);
    }

    this.svg.appendChild(group);
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
