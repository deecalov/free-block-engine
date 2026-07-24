/**
 * Free Block Engine — minimap.
 *
 * Bird's-eye view of all blocks with the current camera viewport.
 * Click or drag on the minimap to navigate the canvas. Lives inside the
 * renderer container (multiple renderer instances each get their own map).
 *
 * @author Paul Deecalov
 * @license MIT
 */

const MAP_WIDTH = 200;
const MAP_HEIGHT = 150;
const PADDING = 40;

export class Minimap {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {import('./blockRenderer.js').BlockRenderer} renderer
   */
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.element = null;
    this.viewportEl = null;
    this._scale = 1;
    this._minX = 0;
    this._minY = 0;
    this._rafPending = false;
    this._dragging = false;
    /** Pool of block nodes, reused across renders. @type {HTMLElement[]} */
    this._nodes = [];
  }

  /**
   * @param {HTMLElement} containerEl
   * @param {AbortSignal} signal
   */
  mount(containerEl, signal) {
    const doc = containerEl.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'minimap';
    this.viewportEl = doc.createElement('div');
    this.viewportEl.className = 'minimap-viewport';
    this.element.appendChild(this.viewportEl);
    containerEl.appendChild(this.element);

    const onPointerDown = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._dragging = true;
      if (this.element.setPointerCapture) {
        try {
          this.element.setPointerCapture(e.pointerId);
        } catch {
          /* pointer capture unsupported (jsdom) */
        }
      }
      this._navigate(e);
    };
    const onPointerMove = (e) => {
      if (!this._dragging) return;
      e.stopPropagation();
      this._navigate(e);
    };
    const onPointerUp = (e) => {
      if (!this._dragging) return;
      e.stopPropagation();
      this._dragging = false;
    };

    this.element.addEventListener('pointerdown', onPointerDown, { signal });
    this.element.addEventListener('pointermove', onPointerMove, { signal });
    this.element.addEventListener('pointerup', onPointerUp, { signal });
    this.element.addEventListener('pointercancel', onPointerUp, { signal });

    this.update();
  }

  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.viewportEl = null;
    }
    this._nodes = [];
  }

  /** Center the camera on the world point under the given pointer event. */
  _navigate(e) {
    const rect = this.element.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const world = {
      x: this._minX + mx / this._scale,
      y: this._minY + my / this._scale,
    };
    this.renderer.centerOn(world);
  }

  /** Schedule a re-render of the minimap (throttled to animation frames). */
  update() {
    if (!this.element || this._rafPending) return;
    this._rafPending = true;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
    raf(() => {
      this._rafPending = false;
      this._render();
    });
  }

  _render() {
    if (!this.element) return;
    const blocks = this.engine.getAllBlocks();

    if (blocks.length === 0 || this.renderer.viewMode !== 'free') {
      this.element.style.display = 'none';
      return;
    }
    this.element.style.display = '';

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const block of blocks) {
      const rect = this.renderer.getBlockRect(block);
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }
    minX -= PADDING;
    minY -= PADDING;
    maxX += PADDING;
    maxY += PADDING;

    const scale = Math.min(MAP_WIDTH / (maxX - minX), MAP_HEIGHT / (maxY - minY));
    this._scale = scale;
    this._minX = minX;
    this._minY = minY;

    // Reuse the existing nodes: this runs on every camera frame, and
    // recreating hundreds of divs per frame was the minimap's main cost.
    const doc = this.element.ownerDocument;
    for (let i = this._nodes.length; i < blocks.length; i++) {
      const el = doc.createElement('div');
      el.className = 'minimap-block';
      this.element.appendChild(el);
      this._nodes.push(el);
    }
    for (const surplus of this._nodes.splice(blocks.length)) {
      surplus.remove();
    }

    blocks.forEach((block, index) => {
      const rect = this.renderer.getBlockRect(block);
      const el = this._nodes[index];
      el.classList.toggle('selected', this.renderer.selectedBlocks.has(block.id));
      el.style.left = `${(rect.x - minX) * scale}px`;
      el.style.top = `${(rect.y - minY) * scale}px`;
      el.style.width = `${Math.max(2, rect.width * scale)}px`;
      el.style.height = `${Math.max(2, rect.height * scale)}px`;
    });

    const view = this.renderer.getViewRect();
    this.viewportEl.style.left = `${(view.x - minX) * scale}px`;
    this.viewportEl.style.top = `${(view.y - minY) * scale}px`;
    this.viewportEl.style.width = `${view.width * scale}px`;
    this.viewportEl.style.height = `${view.height * scale}px`;
  }
}
