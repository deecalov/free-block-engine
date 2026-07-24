/**
 * Free Block Engine — board export to SVG and PNG.
 *
 * The SVG is built from the model, not from the live DOM: block boxes, edge
 * curves (through the same geometry the canvas uses) and wrapped text. Block
 * content is drawn with `<text>` rather than `<foreignObject>`, which some
 * browsers refuse to rasterize when the SVG is loaded into an `Image`.
 *
 * @author Paul Deecalov
 * @license MIT
 */

import { connectionPoint } from './connectionLayer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** Palette used by the exported image, mirroring the two built-in themes. */
const PALETTES = {
  light: {
    background: '#f5f5f5',
    blockFill: '#ffffff',
    blockStroke: '#e0e0e0',
    text: '#333333',
    muted: '#666666',
    single: '#007bff',
    double: '#6f42c1',
  },
  dark: {
    background: '#0f172a',
    blockFill: '#1e293b',
    blockStroke: '#334155',
    text: '#e2e8f0',
    muted: '#94a3b8',
    single: '#38bdf8',
    double: '#f472b6',
  },
};

/** Escape text for inclusion in XML content. */
function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Greedy word wrap by estimated character width — good enough for a static
 * image and free of any layout measurement.
 *
 * @param {string} text
 * @param {number} maxWidth Available width in pixels.
 * @param {number} fontSize
 * @returns {string[]}
 */
function wrapText(text, maxWidth, fontSize) {
  const charWidth = fontSize * 0.55;
  const perLine = Math.max(1, Math.floor(maxWidth / charWidth));
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= perLine) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word.length > perLine ? `${word.slice(0, perLine - 1)}…` : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Bounding box of all blocks, padded.
 * @param {import('./block.js').Block[]} blocks
 * @param {number} padding
 */
function boundsOf(blocks, padding) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of blocks) {
    minX = Math.min(minX, block.position.x);
    minY = Math.min(minY, block.position.y);
    maxX = Math.max(maxX, block.position.x + block.size.width);
    maxY = Math.max(maxY, block.position.y + block.size.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/** One `<g>` per linked pair, drawn with the canvas geometry. */
function renderEdges(engine, palette) {
  const parts = [];
  const seen = new Set();
  for (const block of engine.getAllBlocks()) {
    for (const targetId of block.links.keys()) {
      const key = block.id < targetId ? `${block.id}|${targetId}` : `${targetId}|${block.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const info = engine.getLinkInfo(block.id, targetId);
      if (!info) continue;
      const from = engine.getBlock(info.from);
      const to = engine.getBlock(info.to);
      if (!from || !to) continue;

      const sourceRect = { ...from.position, ...from.size };
      const targetRect = { ...to.position, ...to.size };
      const p1 = connectionPoint(sourceRect, targetRect);
      const p2 = connectionPoint(targetRect, sourceRect);
      const isDouble = info.type === 'double';
      const color = isDouble ? palette.double : palette.single;
      const marker = isDouble ? 'fbe-export-arrow-double' : 'fbe-export-arrow-single';

      parts.push(
        `<path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}" fill="none" stroke="${color}" ` +
          `stroke-width="2" opacity="0.65" marker-end="url(#${marker})"` +
          `${isDouble ? ` marker-start="url(#${marker})"` : ''} />`
      );
      if (info.label) {
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - 6;
        parts.push(
          `<text x="${mx}" y="${my}" font-family="${FONT_FAMILY}" font-size="11" ` +
            `fill="${palette.muted}" text-anchor="middle">${escapeXml(info.label)}</text>`
        );
      }
    }
  }
  return parts;
}

/** One rounded rect plus wrapped content per block. */
function renderBlocks(blocks, palette) {
  const parts = [];
  for (const block of [...blocks].sort((a, b) => a.zIndex - b.zIndex)) {
    const { x, y } = block.position;
    const { width, height } = block.size;
    parts.push(
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="8" ` +
        `fill="${palette.blockFill}" stroke="${palette.blockStroke}" stroke-width="2" />`
    );
    parts.push(
      `<text x="${x + 15}" y="${y + 24}" font-family="${FONT_FAMILY}" font-size="11" ` +
        `fill="${palette.muted}">${escapeXml(block.type)}</text>`
    );

    const lines = wrapText(block.content, width - 30, 14);
    const maxLines = Math.max(1, Math.floor((height - 50) / 18));
    lines.slice(0, maxLines).forEach((line, index) => {
      parts.push(
        `<text x="${x + 15}" y="${y + 48 + index * 18}" font-family="${FONT_FAMILY}" ` +
          `font-size="14" fill="${palette.text}">${escapeXml(line)}</text>`
      );
    });
  }
  return parts;
}

/**
 * Serialize the board to a standalone SVG document.
 *
 * @param {import('./blockEngine.js').BlockEngine} engine
 * @param {object} [options]
 * @param {number} [options.padding] Margin around the content (40).
 * @param {'light'|'dark'} [options.theme] Colour palette ('light').
 * @param {boolean} [options.background] Paint the background rect (true).
 * @returns {string} SVG markup.
 */
export function exportToSVG(engine, options = {}) {
  const padding = options.padding ?? 40;
  const palette = PALETTES[options.theme === 'dark' ? 'dark' : 'light'];
  const withBackground = options.background !== false;
  const blocks = engine.getAllBlocks();
  const bounds = blocks.length
    ? boundsOf(blocks, padding)
    : { x: 0, y: 0, width: padding * 2, height: padding * 2 };

  const marker = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" ` +
    `markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`;

  return [
    `<svg xmlns="${SVG_NS}" width="${bounds.width}" height="${bounds.height}" ` +
      `viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">`,
    `<defs>${marker('fbe-export-arrow-single', palette.single)}${marker('fbe-export-arrow-double', palette.double)}</defs>`,
    withBackground
      ? `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${palette.background}" />`
      : '',
    ...renderEdges(engine, palette),
    ...renderBlocks(blocks, palette),
    '</svg>',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Rasterize the board to a PNG blob by drawing the exported SVG onto a canvas.
 * Browser only — requires `Image`, `<canvas>` and `Blob`.
 *
 * @param {import('./blockEngine.js').BlockEngine} engine
 * @param {object} [options] Options of {@link exportToSVG} plus `scale`.
 * @param {number} [options.scale] Pixel ratio of the output (2).
 * @param {Document} [options.document] Document used to create the canvas.
 * @returns {Promise<Blob>}
 */
export function exportToPNG(engine, options = {}) {
  const doc = options.document ?? globalThis.document;
  const scale = options.scale ?? 2;
  const svg = exportToSVG(engine, options);
  const view = doc?.defaultView ?? globalThis;

  if (!doc || typeof view.Image !== 'function') {
    return Promise.reject(new Error('exportToPNG requires a browser environment'));
  }

  const canvas = doc.createElement('canvas');
  if (typeof canvas.getContext !== 'function' || !canvas.getContext('2d')) {
    return Promise.reject(new Error('exportToPNG requires canvas support'));
  }

  const widthMatch = svg.match(/width="([\d.]+)"/);
  const heightMatch = svg.match(/height="([\d.]+)"/);
  const width = Number(widthMatch?.[1] ?? 0);
  const height = Number(heightMatch?.[1] ?? 0);
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  // A data URL keeps the canvas untainted, unlike a blob URL in some browsers.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    const image = new view.Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('exportToPNG: canvas produced no blob'));
      }, 'image/png');
    };
    image.onerror = () => reject(new Error('exportToPNG: the SVG could not be rasterized'));
    image.src = source;
  });
}
