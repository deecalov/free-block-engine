import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockEngine, BlockRenderer, exportToSVG, exportToPNG } from '../src/index.js';

describe('exportToSVG', () => {
  /** @type {BlockEngine} */
  let engine;

  beforeEach(() => {
    engine = new BlockEngine();
  });

  /** Parse the markup so assertions run against a real document. */
  function parse(svg) {
    return new window.DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  }

  it('produces a well-formed document sized to the content', () => {
    engine.createBlock('a', 'note', { x: 100, y: 100 }, { width: 200, height: 100 });
    const root = parse(exportToSVG(engine, { padding: 40 }));

    expect(root.querySelector('parsererror')).toBeNull();
    expect(root.tagName).toBe('svg');
    // 200 wide + 2 × 40 padding, anchored at 100 − 40.
    expect(root.getAttribute('width')).toBe('280');
    expect(root.getAttribute('height')).toBe('180');
    expect(root.getAttribute('viewBox')).toBe('60 60 280 180');
    expect(root.querySelectorAll('rect').length).toBeGreaterThanOrEqual(2); // background + block
  });

  it('handles an empty board', () => {
    const root = parse(exportToSVG(engine));
    expect(root.querySelector('parsererror')).toBeNull();
    expect(root.getAttribute('width')).toBe('80');
  });

  it('draws one edge per pair with arrow markers and labels', () => {
    const a = engine.createBlock('a', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    const c = engine.createBlock('c', 'default', { x: 0, y: 600 });
    engine.linkBlocks(a.id, b.id, 'single', 'depends on');
    engine.linkBlocks(a.id, c.id, 'double');

    const root = parse(exportToSVG(engine));
    const paths = [...root.querySelectorAll('path[marker-end]')];
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.getAttribute('marker-start'))).toBe(true); // the double link
    expect(root.textContent).toContain('depends on');
    expect(root.querySelectorAll('marker')).toHaveLength(2);
  });

  it('escapes markup in content and labels', () => {
    const a = engine.createBlock('<script>alert("x")</script> & co', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('b', 'default', { x: 600, y: 0 });
    engine.linkBlocks(a.id, b.id, 'single', '<bad> & "worse"');

    const svg = exportToSVG(engine);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&amp;');

    const root = parse(svg);
    expect(root.querySelector('parsererror')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.textContent).toContain('alert("x")');
  });

  it('wraps long content and clips it to the block height', () => {
    engine.createBlock('word '.repeat(200).trim(), 'default', { x: 0, y: 0 });
    const root = parse(exportToSVG(engine));
    const lines = [...root.querySelectorAll('text')].filter((t) => t.textContent.includes('word'));
    expect(lines.length).toBeGreaterThan(1);
    // 150px tall block leaves room for a handful of lines, not two hundred.
    expect(lines.length).toBeLessThan(10);
  });

  it('respects the theme and the background switch', () => {
    engine.createBlock('a', 'default', { x: 0, y: 0 });
    expect(exportToSVG(engine, { theme: 'light' })).toContain('#f5f5f5');
    expect(exportToSVG(engine, { theme: 'dark' })).toContain('#0f172a');
    expect(exportToSVG(engine, { background: false })).not.toContain('#f5f5f5');
  });

  it('orders blocks by their stacking index', () => {
    const a = engine.createBlock('first', 'default', { x: 0, y: 0 });
    const b = engine.createBlock('second', 'default', { x: 400, y: 0 });
    engine.setBlockZIndex(a.id, 5);
    engine.setBlockZIndex(b.id, 1);

    const svg = exportToSVG(engine);
    expect(svg.indexOf('second')).toBeLessThan(svg.indexOf('first'));
  });
});

describe('BlockRenderer export helpers', () => {
  /** @type {HTMLElement} */
  let container;
  /** @type {BlockRenderer} */
  let renderer;
  /** @type {BlockEngine} */
  let engine;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    engine = new BlockEngine();
    renderer = new BlockRenderer(engine, container);
  });

  afterEach(() => {
    renderer.destroy();
    container.remove();
    document.body.innerHTML = '';
  });

  it('exports SVG using the renderer theme', () => {
    engine.createBlock('a', 'default', { x: 0, y: 0 });
    expect(renderer.exportToSVG()).toContain('#f5f5f5');

    renderer.setTheme('dark');
    expect(renderer.exportToSVG()).toContain('#0f172a');
    expect(renderer.exportToSVG({ theme: 'light' })).toContain('#f5f5f5'); // explicit wins
  });

  it('rejects PNG export where canvas is unavailable (jsdom)', async () => {
    engine.createBlock('a', 'default', { x: 0, y: 0 });
    // jsdom ships no canvas implementation; the helper must fail loudly
    // rather than hand back a broken blob. Real rasterization is verified
    // in the browser smoke test.
    await expect(exportToPNG(engine, { document })).rejects.toThrow(/canvas|browser/i);
  });
});
