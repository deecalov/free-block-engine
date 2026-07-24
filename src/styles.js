/**
 * Free Block Engine — injected stylesheet for BlockRenderer.
 *
 * Theming is driven by CSS custom properties declared on .blocks-container;
 * override them (or any class below) in host CSS to restyle the canvas.
 *
 * @author Paul Deecalov
 * @license MIT
 */

const STYLE_ID = 'block-renderer-styles';

/**
 * Dark palette. Declared once and applied both by the explicit
 * `fbe-theme-dark` class and by `fbe-theme-auto` under a dark OS preference.
 */
const DARK_VARS = `
    --fbe-accent: #3b82f6;
    --fbe-accent-strong: #60a5fa;
    --fbe-danger: #f87171;
    --fbe-bg: #0f172a;
    --fbe-grid-line: rgba(148, 163, 184, 0.12);
    --fbe-block-bg: #1e293b;
    --fbe-block-border: #334155;
    --fbe-block-selected-bg: #1e3a5f;
    --fbe-text: #e2e8f0;
    --fbe-text-muted: #94a3b8;
    --fbe-text-subtle: #64748b;
    --fbe-surface: #1e293b;
    --fbe-surface-muted: #334155;
    --fbe-surface-raised: #24344c;
    --fbe-border: #334155;
    --fbe-shadow: rgba(0, 0, 0, 0.5);
    --fbe-edge-single: #38bdf8;
    --fbe-edge-double: #f472b6;
    --fbe-edge-label: #cbd5e1;
`;

const CSS = `
  .blocks-container {
    --fbe-accent: #007bff;
    --fbe-accent-strong: #0056b3;
    --fbe-danger: #dc3545;
    --fbe-bg: #f5f5f5;
    --fbe-grid-line: rgba(200, 200, 200, 0.25);
    --fbe-block-bg: #ffffff;
    --fbe-block-border: #e0e0e0;
    --fbe-block-selected-bg: #f0f8ff;
    --fbe-text: #333333;
    --fbe-text-muted: #666;
    --fbe-text-subtle: #999999;
    --fbe-surface: #ffffff;
    --fbe-surface-muted: #f5f5f5;
    --fbe-surface-raised: #f9f9f9;
    --fbe-border: #dddddd;
    --fbe-shadow: rgba(0, 0, 0, 0.15);
    --fbe-edge-single: #007bff;
    --fbe-edge-double: #6f42c1;
    --fbe-edge-label: #444444;

    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: var(--fbe-text);
    background: var(--fbe-bg);
    background-image:
      linear-gradient(var(--fbe-grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--fbe-grid-line) 1px, transparent 1px);
    background-size: 20px 20px;
    touch-action: none;
  }

  .blocks-container.panning {
    cursor: grab;
  }

  .blocks-container.grid-mode {
    overflow: auto;
    background-image: none;
    touch-action: auto;
  }

  .blocks-viewport {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }

  .grid-mode .blocks-viewport {
    position: static;
    width: auto;
    height: auto;
    transform: none !important;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
    padding: 20px;
  }

  .block {
    background: var(--fbe-block-bg);
    color: var(--fbe-text);
    border: 2px solid var(--fbe-block-border);
    border-radius: 8px;
    padding: 15px;
    position: absolute;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
    cursor: move;
    min-width: 150px;
    min-height: 100px;
    user-select: none;
    overflow: hidden;
    box-sizing: border-box;
    /* Per-block order comes from a custom property, not an inline z-index:
       an inline value would beat the .dragging / :hover rules below. */
    z-index: calc(2 + var(--fbe-z, 0));
  }

  .grid-mode .block {
    position: relative !important;
    left: auto !important;
    top: auto !important;
    width: auto !important;
    height: auto !important;
  }

  .block:hover {
    border-color: var(--fbe-accent);
    box-shadow: 0 4px 8px var(--fbe-shadow);
    z-index: 10;
  }

  .block.selected {
    border-color: var(--fbe-accent);
    background: var(--fbe-block-selected-bg);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--fbe-accent) 20%, transparent);
  }

  .block.dragging {
    opacity: 0.85;
    z-index: 1000;
    cursor: grabbing;
    transition: none;
  }

  .block.resizing {
    z-index: 999;
    transition: none;
  }

  .block.flash {
    animation: fbe-flash 1.2s ease-out;
  }

  .block.fbe-offscreen {
    display: none;
  }

  @keyframes fbe-flash {
    0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--fbe-accent) 55%, transparent); }
    100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--fbe-accent) 0%, transparent); }
  }

  .block.linking-source {
    border-color: var(--fbe-accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--fbe-accent) 35%, transparent);
  }

  .blocks-container.linking .block {
    cursor: crosshair;
  }

  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    cursor: move;
  }

  .block-id {
    font-size: 12px;
    color: var(--fbe-text-muted);
    font-family: monospace;
  }

  .block-type {
    position: absolute;
    bottom: 10px;
    right: 10px;
    font-size: 11px;
    background: var(--fbe-block-border);
    padding: 2px 8px;
    border-radius: 12px;
    text-transform: uppercase;
    color: var(--fbe-text-muted);
  }

  .block-content {
    margin: 10px 0;
    min-height: 50px;
    white-space: pre-wrap;
    word-wrap: break-word;
    cursor: text;
    padding-bottom: 20px;
    overflow-y: auto;
    max-height: calc(100% - 100px);
    user-select: text;
  }

  .block-content[contenteditable='true']:focus {
    outline: none;
    padding: 5px;
    padding-bottom: 25px;
    background: var(--fbe-surface-raised);
    border-radius: 4px;
  }

  .block-content:empty::before {
    content: attr(data-placeholder);
    color: var(--fbe-text-subtle);
    pointer-events: none;
  }

  .block-links {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--fbe-block-border);
  }

  .block-links-label {
    font-size: 12px;
    color: var(--fbe-text-muted);
    margin-bottom: 5px;
  }

  .block-link {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    background: var(--fbe-accent);
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    margin-right: 5px;
    margin-bottom: 5px;
    text-decoration: none;
    cursor: pointer;
    position: relative;
  }

  .block-link:hover {
    background: var(--fbe-accent-strong);
  }

  .block-link-type {
    margin-right: 5px;
    font-weight: bold;
  }

  .block-actions {
    position: absolute;
    top: 10px;
    right: 10px;
    display: none;
    z-index: 3;
  }

  .block:hover .block-actions {
    display: flex;
    gap: 5px;
  }

  .read-only .block-actions {
    display: none !important;
  }

  .block-action {
    background: var(--fbe-surface-muted);
    color: var(--fbe-text);
    border: none;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .block-action:hover {
    background: var(--fbe-block-border);
  }

  .block-action.delete {
    color: var(--fbe-danger);
  }

  .block-action.links {
    color: var(--fbe-accent);
  }

  .block-metadata {
    font-size: 10px;
    color: var(--fbe-text-subtle);
    margin-top: 10px;
  }

  .resize-handle {
    position: absolute;
    background: var(--fbe-accent);
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 4;
  }

  .block:hover .resize-handle {
    opacity: 0.3;
  }

  .resize-handle:hover,
  .resize-handle.active {
    opacity: 1 !important;
  }

  .read-only .resize-handle {
    display: none;
  }

  .resize-handle-right {
    right: 0;
    top: 20%;
    bottom: 20%;
    width: 6px;
    cursor: ew-resize;
  }

  .resize-handle-bottom {
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 6px;
    cursor: ns-resize;
  }

  .resize-handle-corner {
    width: 12px;
    height: 12px;
    right: 0;
    bottom: 0;
    cursor: nwse-resize;
    border-radius: 0 0 6px 0;
  }

  .connections-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 1;
  }

  .grid-mode .connections-layer {
    display: none;
  }

  .fbe-edge {
    color: var(--fbe-edge-single);
  }

  .fbe-edge[data-type='double'] {
    color: var(--fbe-edge-double);
  }

  .fbe-edge .edge-path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    opacity: 0.65;
  }

  .fbe-edge .edge-hit {
    fill: none;
    stroke: transparent;
    stroke-width: 14;
    pointer-events: stroke;
    cursor: pointer;
  }

  .read-only .fbe-edge .edge-hit {
    cursor: default;
  }

  .fbe-edge:hover .edge-path {
    stroke-width: 3;
    opacity: 1;
  }

  .fbe-edge .edge-dot {
    fill: currentColor;
    opacity: 0.85;
  }

  .fbe-edge .edge-label {
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    fill: var(--fbe-edge-label);
    stroke: var(--fbe-bg);
    stroke-width: 3px;
    paint-order: stroke;
    pointer-events: none;
    text-anchor: middle;
  }

  .fbe-marker {
    fill: var(--fbe-edge-single);
  }

  .fbe-marker-double {
    fill: var(--fbe-edge-double);
  }

  .linking-line {
    stroke: var(--fbe-accent);
    stroke-width: 2;
    stroke-dasharray: 5, 5;
    pointer-events: none;
  }

  .fbe-guides {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 950;
  }

  .fbe-guide {
    position: absolute;
    background: var(--fbe-danger);
    opacity: 0.75;
  }

  .fbe-guide-vertical {
    width: 1px;
  }

  .fbe-guide-horizontal {
    height: 1px;
  }

  .fbe-lasso {
    position: absolute;
    border: 1px dashed var(--fbe-accent);
    background: color-mix(in srgb, var(--fbe-accent) 8%, transparent);
    pointer-events: none;
    z-index: 900;
  }

  .link-editor-popup {
    position: absolute;
    background: var(--fbe-surface);
    color: var(--fbe-text);
    border: 1px solid var(--fbe-border);
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px var(--fbe-shadow);
    z-index: 1001;
    min-width: 260px;
    cursor: default;
  }

  .link-editor-popup h3 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: var(--fbe-text);
  }

  .link-editor-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .link-editor-item {
    padding: 8px;
    border: 1px solid var(--fbe-block-border);
    border-radius: 4px;
    margin-bottom: 8px;
    background: var(--fbe-surface-raised);
  }

  .link-editor-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
  }

  .link-editor-item-title {
    font-weight: bold;
    font-size: 14px;
    color: var(--fbe-text);
  }

  .link-editor-item-content {
    font-size: 12px;
    color: var(--fbe-text-muted);
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 240px;
  }

  .link-editor-item-actions {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .link-editor-item-actions button {
    padding: 4px 8px;
    border: 1px solid var(--fbe-border);
    border-radius: 3px;
    background: var(--fbe-surface);
    color: var(--fbe-text);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .link-editor-item-actions button:hover {
    background: var(--fbe-surface-muted);
    border-color: var(--fbe-accent);
  }

  .link-editor-item-actions button.active {
    background: var(--fbe-accent);
    color: white;
    border-color: var(--fbe-accent);
  }

  .link-editor-item-actions button.delete {
    color: var(--fbe-danger);
    border-color: var(--fbe-danger);
    margin-left: auto;
  }

  .link-editor-item-actions button.delete:hover {
    background: var(--fbe-danger);
    color: white;
  }

  .link-editor-label {
    width: 100%;
    box-sizing: border-box;
    margin-top: 6px;
    padding: 4px 6px;
    border: 1px solid var(--fbe-border);
    border-radius: 3px;
    background: var(--fbe-surface);
    color: var(--fbe-text);
    font-size: 12px;
  }

  .link-editor-add {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--fbe-block-border);
  }

  .link-editor-add-button {
    width: 100%;
    padding: 8px;
    border: 2px dashed var(--fbe-accent);
    border-radius: 4px;
    background: color-mix(in srgb, var(--fbe-accent) 8%, transparent);
    color: var(--fbe-accent);
    cursor: pointer;
    font-size: 14px;
    text-align: center;
  }

  .link-editor-add-button:hover {
    background: color-mix(in srgb, var(--fbe-accent) 16%, transparent);
    border-style: solid;
  }

  .link-editor-close {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--fbe-text-muted);
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .link-editor-close:hover {
    color: var(--fbe-text);
  }

  .minimap {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 200px;
    height: 150px;
    background: color-mix(in srgb, var(--fbe-surface) 92%, transparent);
    border: 1px solid var(--fbe-border);
    border-radius: 4px;
    overflow: hidden;
    z-index: 100;
    cursor: pointer;
    touch-action: none;
  }

  .grid-mode .minimap {
    display: none;
  }

  .minimap-viewport {
    position: absolute;
    border: 2px solid var(--fbe-accent);
    background: color-mix(in srgb, var(--fbe-accent) 10%, transparent);
    pointer-events: none;
  }

  .minimap-block {
    position: absolute;
    background: var(--fbe-text-muted);
    border-radius: 2px;
    pointer-events: none;
  }

  .minimap-block.selected {
    background: var(--fbe-accent);
  }

  .fbe-context-menu {
    position: absolute;
    min-width: 180px;
    padding: 4px;
    background: var(--fbe-surface);
    color: var(--fbe-text);
    border: 1px solid var(--fbe-border);
    border-radius: 8px;
    box-shadow: 0 6px 16px var(--fbe-shadow);
    z-index: 1002;
    cursor: default;
    font-size: 13px;
  }

  .fbe-context-item {
    display: block;
    width: 100%;
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .fbe-context-item:hover:not([disabled]),
  .fbe-context-item:focus-visible {
    background: color-mix(in srgb, var(--fbe-accent) 14%, transparent);
    outline: none;
  }

  .fbe-context-item[disabled] {
    color: var(--fbe-text-subtle);
    cursor: default;
  }

  .fbe-context-separator {
    height: 1px;
    margin: 4px 6px;
    background: var(--fbe-border);
  }

  .blocks-container.fbe-theme-dark {
${DARK_VARS}  }

  @media (prefers-color-scheme: dark) {
    .blocks-container.fbe-theme-auto {
${DARK_VARS}    }
  }
`;

/**
 * Inject the renderer stylesheet into the document once.
 * @param {Document} doc
 */
export function injectStyles(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const styleSheet = doc.createElement('style');
  styleSheet.id = STYLE_ID;
  styleSheet.textContent = CSS;
  doc.head.appendChild(styleSheet);
}
