/**
 * Free Block Engine — alignment guides for dragging.
 *
 * While a block is dragged, its edges and center are compared with the other
 * blocks; when one lands within the threshold the position is nudged onto the
 * match and a guide line is drawn. Pure geometry lives in `findAlignment()`,
 * which is DOM-free and unit tested on its own.
 *
 * @author Paul Deecalov
 * @license MIT
 */

/**
 * @typedef {{x: number, y: number, width: number, height: number}} Rect
 * @typedef {{position: number, from: number, to: number}} Guide
 * @typedef {{dx: number, dy: number, vertical: Guide[], horizontal: Guide[]}} Alignment
 */

/** Candidate offsets along one axis: near edge, center, far edge. */
function anchors(start, size) {
  return [start, start + size / 2, start + size];
}

/**
 * Find the best alignment of `moving` against `others`.
 *
 * Returns the world-space correction (`dx`/`dy`) that snaps the block onto the
 * nearest anchor within `threshold`, plus the guide lines to draw. Each axis is
 * resolved independently, so a block can snap horizontally and vertically to
 * two different neighbours.
 *
 * @param {Rect} moving Rect of the dragged block.
 * @param {Rect[]} others Rects of the candidate neighbours.
 * @param {number} threshold Maximum world-space distance to snap over.
 * @returns {Alignment}
 */
export function findAlignment(moving, others, threshold) {
  const result = { dx: 0, dy: 0, vertical: [], horizontal: [] };
  if (!others.length || threshold <= 0) return result;

  const movingX = anchors(moving.x, moving.width);
  const movingY = anchors(moving.y, moving.height);
  let bestX = null;
  let bestY = null;

  for (const other of others) {
    for (const target of anchors(other.x, other.width)) {
      for (const source of movingX) {
        const distance = Math.abs(target - source);
        if (distance <= threshold && (bestX === null || distance < bestX.distance)) {
          bestX = { distance, delta: target - source, position: target };
        }
      }
    }
    for (const target of anchors(other.y, other.height)) {
      for (const source of movingY) {
        const distance = Math.abs(target - source);
        if (distance <= threshold && (bestY === null || distance < bestY.distance)) {
          bestY = { distance, delta: target - source, position: target };
        }
      }
    }
  }

  if (bestX) {
    result.dx = bestX.delta;
    result.vertical = [guideFor(bestX.position, moving, others, 'x')];
  }
  if (bestY) {
    result.dy = bestY.delta;
    result.horizontal = [guideFor(bestY.position, moving, others, 'y')];
  }
  return result;
}

/**
 * Extend a guide line across everything it touches, so it visually connects
 * the dragged block with the neighbours it lines up with.
 */
function guideFor(position, moving, others, axis) {
  const cross = axis === 'x' ? 'y' : 'x';
  const crossSize = axis === 'x' ? 'height' : 'width';
  const size = axis === 'x' ? 'width' : 'height';

  let from = moving[cross];
  let to = moving[cross] + moving[crossSize];
  for (const other of others) {
    if (anchors(other[axis], other[size]).some((value) => Math.abs(value - position) < 0.5)) {
      from = Math.min(from, other[cross]);
      to = Math.max(to, other[cross] + other[crossSize]);
    }
  }
  return { position, from, to };
}

/**
 * Draws guide lines into an overlay inside the renderer viewport, so they
 * share the camera transform and need no screen-space maths.
 */
export class GuideOverlay {
  /** @param {import('./blockRenderer.js').BlockRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.element = null;
  }

  /** @param {Alignment} alignment */
  show(alignment) {
    const lines = [...alignment.vertical, ...alignment.horizontal];
    if (lines.length === 0) {
      this.hide();
      return;
    }
    const doc = this.renderer.viewport.ownerDocument;
    if (!this.element) {
      this.element = doc.createElement('div');
      this.element.className = 'fbe-guides';
      this.renderer.viewport.appendChild(this.element);
    }
    this.element.innerHTML = '';
    for (const guide of alignment.vertical) {
      this._line(doc, 'vertical', guide);
    }
    for (const guide of alignment.horizontal) {
      this._line(doc, 'horizontal', guide);
    }
  }

  _line(doc, orientation, guide) {
    const line = doc.createElement('div');
    line.className = `fbe-guide fbe-guide-${orientation}`;
    if (orientation === 'vertical') {
      line.style.left = `${guide.position}px`;
      line.style.top = `${guide.from}px`;
      line.style.height = `${guide.to - guide.from}px`;
    } else {
      line.style.top = `${guide.position}px`;
      line.style.left = `${guide.from}px`;
      line.style.width = `${guide.to - guide.from}px`;
    }
    this.element.appendChild(line);
  }

  hide() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}
