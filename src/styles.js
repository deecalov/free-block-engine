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
    --fbe-text-muted: #666;
    --fbe-edge-single: #007bff;
    --fbe-edge-double: #6f42c1;

    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
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
    z-index: 2;
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
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    z-index: 10;
  }

  .block.selected {
    border-color: var(--fbe-accent);
    background: var(--fbe-block-selected-bg);
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.2);
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

  @keyframes fbe-flash {
    0% { box-shadow: 0 0 0 4px rgba(0, 123, 255, 0.55); }
    100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
  }

  .block.linking-source {
    border-color: var(--fbe-accent);
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.35);
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
    background: #f9f9f9;
    border-radius: 4px;
  }

  .block-content:empty::before {
    content: attr(data-placeholder);
    color: #aaa;
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
    background: #f0f0f0;
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
    color: #999;
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
    fill: #444;
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

  .fbe-lasso {
    position: absolute;
    border: 1px dashed var(--fbe-accent);
    background: rgba(0, 123, 255, 0.08);
    pointer-events: none;
    z-index: 900;
  }

  .link-editor-popup {
    position: absolute;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1001;
    min-width: 260px;
    cursor: default;
  }

  .link-editor-popup h3 {
    margin: 0 0 10px 0;
    font-size: 16px;
    color: #333;
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
    background: #f9f9f9;
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
    color: #333;
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
    border: 1px solid #ddd;
    border-radius: 3px;
    background: white;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .link-editor-item-actions button:hover {
    background: #f0f0f0;
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
    border: 1px solid #ddd;
    border-radius: 3px;
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
    background: #f0f8ff;
    color: var(--fbe-accent);
    cursor: pointer;
    font-size: 14px;
    text-align: center;
  }

  .link-editor-add-button:hover {
    background: #e6f2ff;
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
    color: #333;
  }

  .minimap {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 200px;
    height: 150px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid #ddd;
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
    background: rgba(0, 123, 255, 0.1);
    pointer-events: none;
  }

  .minimap-block {
    position: absolute;
    background: #666;
    border-radius: 2px;
    pointer-events: none;
  }

  .minimap-block.selected {
    background: var(--fbe-accent);
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
