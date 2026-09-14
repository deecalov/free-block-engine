import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockEngine, BlockRenderer } from '../src/index.js';

describe('ConnectionLayer', () => {
  /** @type {BlockEngine} */
  let engine;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {HTMLElement} */
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    // jsdom does no layout; the culling tests need a measurable container.
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true });
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  const edges = () => [...container.querySelectorAll('.fbe-edge')];
  const pathOf = (edge) => edge.querySelector('.edge-path').getAttribute('d');

  it('relayouts an edge in place when a block moves instead of recreating it', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    engine.linkBlocks(a.id, b.id, 'single', 'label');
    const [edge] = edges();
    const before = pathOf(edge);

    engine.setBlockPosition(b.id, 600, 400);

    expect(edges()).toHaveLength(1);
    expect(edges()[0]).toBe(edge);
    expect(pathOf(edge)).not.toBe(before);
    expect(edge.querySelector('.edge-hit').getAttribute('d')).toBe(pathOf(edge));
    expect(edge.querySelector('.edge-label').textContent).toBe('label');
    expect(renderer.connections.size).toBe(1);
  });

  it('touches only the edges of the moved block', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    const c = engine.createBlock('c', 'default', { x: 0, y: 600 });
    const d = engine.createBlock('d', 'default', { x: 600, y: 600 });
    engine.linkBlocks(a.id, b.id);
    engine.linkBlocks(c.id, d.id);
    const cd = edges().find((e) => e.dataset.from === c.id);
    const cdPath = pathOf(cd);

    engine.setBlockPosition(a.id, 100, 100);

    expect(edges()).toHaveLength(2);
    expect(edges()).toContain(cd);
    expect(pathOf(cd)).toBe(cdPath);
  });

  it('adds, updates and removes the label without rebuilding the edge', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    engine.linkBlocks(a.id, b.id);
    const [edge] = edges();
    expect(edge.querySelector('.edge-label')).toBeNull();

    engine.setLinkLabel(a.id, b.id, 'first');
    expect(edges()[0]).toBe(edge);
    expect(edge.querySelector('.edge-label').textContent).toBe('first');

    engine.setLinkLabel(a.id, b.id, 'second');
    expect(edge.querySelector('.edge-label').textContent).toBe('second');

    engine.setLinkLabel(a.id, b.id, '');
    expect(edge.querySelector('.edge-label')).toBeNull();
  });

  it('rebuilds the edge when the direction or type changes and drops it when unlinked', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    engine.linkBlocks(a.id, b.id, 'single');
    expect(edges()[0].dataset.from).toBe(a.id);
    expect(edges()[0].querySelector('.edge-dot')).toBeTruthy();

    engine.updateLinkType(a.id, b.id, 'reverse');
    expect(edges()).toHaveLength(1);
    expect(edges()[0].dataset.from).toBe(b.id);
    expect(edges()[0].dataset.to).toBe(a.id);

    engine.updateLinkType(a.id, b.id, 'double');
    expect(edges()).toHaveLength(1);
    expect(edges()[0].dataset.type).toBe('double');
    expect(edges()[0].querySelector('.edge-path').getAttribute('marker-start')).toBeTruthy();
    expect(edges()[0].querySelector('.edge-dot')).toBeNull();

    engine.unlinkBlocks(a.id, b.id);
    expect(edges()).toHaveLength(0);
    expect(renderer.connections.size).toBe(0);
  });

  it('removes the edges of a deleted block and brings them back on undo', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    const c = engine.createBlock('c', 'default', { x: 0, y: 600 });
    engine.linkBlocks(a.id, b.id);
    engine.linkBlocks(c.id, b.id);
    expect(edges()).toHaveLength(2);

    engine.deleteBlock(b.id);
    expect(edges()).toHaveLength(0);
    expect(renderer.connections.size).toBe(0);

    engine.undo();
    expect(edges()).toHaveLength(2);
    expect(renderer.connections.size).toBe(2);
  });

  describe('culling', () => {
    beforeEach(() => {
      renderer.destroy();
      renderer = new BlockRenderer(engine, container, { cullOffscreen: true, cullMargin: 100 });
    });

    const isHidden = (edge) => edge.classList.contains('fbe-offscreen');
    const edgeFrom = (id) => edges().find((e) => e.dataset.from === id);

    it('hides edges outside the viewport and reveals them when the camera moves', () => {
      const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
      const b = engine.createBlock('b', 'default', { x: 400, y: 0 });
      const c = engine.createBlock('c', 'default', { x: 20000, y: 20000 });
      const d = engine.createBlock('d', 'default', { x: 20400, y: 20000 });
      engine.linkBlocks(a.id, b.id);
      engine.linkBlocks(c.id, d.id);

      expect(isHidden(edgeFrom(a.id))).toBe(false);
      expect(isHidden(edgeFrom(c.id))).toBe(true);

      renderer.setCamera({ x: -20000, y: -20000, zoom: 1 });
      renderer.applyCulling();
      expect(isHidden(edgeFrom(a.id))).toBe(true);
      expect(isHidden(edgeFrom(c.id))).toBe(false);
    });

    it('keeps an edge that spans from a visible block to a culled one', () => {
      const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
      const far = engine.createBlock('far', 'default', { x: 20000, y: 0 });
      engine.linkBlocks(a.id, far.id);
      expect(renderer.getBlockElement(far.id).classList.contains('fbe-offscreen')).toBe(true);
      expect(isHidden(edgeFrom(a.id))).toBe(false);
    });

    it('re-evaluates an edge when one of its blocks moves', () => {
      const a = engine.createBlock('a', 'default', { x: 20000, y: 20000 });
      const b = engine.createBlock('b', 'default', { x: 20400, y: 20000 });
      engine.linkBlocks(a.id, b.id);
      expect(isHidden(edgeFrom(a.id))).toBe(true);

      engine.setBlockPosition(a.id, 0, 0);
      expect(isHidden(edgeFrom(a.id))).toBe(false);
    });

    it('shows every edge again when culling is turned off', () => {
      const c = engine.createBlock('c', 'default', { x: 20000, y: 20000 });
      const d = engine.createBlock('d', 'default', { x: 20400, y: 20000 });
      engine.linkBlocks(c.id, d.id);
      expect(isHidden(edgeFrom(c.id))).toBe(true);

      renderer.setCullOffscreen(false);
      expect(isHidden(edgeFrom(c.id))).toBe(false);
    });
  });
});
