/**
 * Free Block Engine — context menu for blocks and the canvas.
 *
 * Opened by right-click or a touch long-press. The item list is built from
 * the renderer state and can be replaced wholesale through the
 * `contextMenuItems` option. The menu is keyboard operable (arrows, Home/End,
 * Enter, Escape) and carries menu ARIA roles.
 *
 * @author Paul Deecalov
 * @license MIT
 */

/**
 * @typedef {object} ContextMenuTarget
 * @property {'block'|'canvas'} type What was clicked.
 * @property {string|null} blockId Block under the pointer, if any.
 * @property {{x: number, y: number}} world World coordinates of the click.
 *
 * @typedef {object} ContextMenuItem
 * @property {string} label Text shown in the menu.
 * @property {() => void} [action] Invoked on activation; omit for a separator.
 * @property {boolean} [separator] Render a divider instead of a command.
 * @property {boolean} [disabled] Render greyed out and non-activatable.
 */

export class ContextMenu {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {import('./blockRenderer.js').BlockRenderer} renderer
   */
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.element = null;
    /** @type {ContextMenuTarget|null} */
    this.target = null;
  }

  get isOpen() {
    return this.element !== null;
  }

  /** @param {Node} node */
  contains(node) {
    return this.element !== null && this.element.contains(node);
  }

  /**
   * Open the menu at a screen position for the given target.
   * @param {ContextMenuTarget} target
   * @param {{clientX: number, clientY: number}} pointer
   */
  open(target, pointer) {
    this.close();
    const items = this._itemsFor(target);
    if (items.length === 0) return;

    const doc = this.renderer.container.ownerDocument;
    const el = doc.createElement('div');
    el.className = 'fbe-context-menu';
    el.setAttribute('role', 'menu');
    el.tabIndex = -1;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('keydown', (e) => this._onKeyDown(e));

    for (const item of items) {
      el.appendChild(item.separator ? this._separator(doc) : this._item(doc, item));
    }

    this.renderer.container.appendChild(el);
    this.element = el;
    this.target = target;

    const rect = this.renderer.container.getBoundingClientRect();
    this._position(pointer.clientX - rect.left, pointer.clientY - rect.top);
    const first = this._items()[0];
    if (first) first.focus();
  }

  close() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this.target = null;
  }

  /** Enabled command buttons, in visual order. @returns {HTMLElement[]} */
  _items() {
    if (!this.element) return [];
    return [...this.element.querySelectorAll('.fbe-context-item:not([disabled])')];
  }

  _separator(doc) {
    const el = doc.createElement('div');
    el.className = 'fbe-context-separator';
    el.setAttribute('role', 'separator');
    return el;
  }

  _item(doc, item) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'fbe-context-item';
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.tabIndex = -1;
    if (item.disabled) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    } else {
      button.addEventListener('click', () => {
        this.close();
        item.action?.();
      });
    }
    return button;
  }

  _onKeyDown(e) {
    const items = this._items();
    if (items.length === 0) return;
    const current = items.indexOf(this.element.ownerDocument.activeElement);

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = (current + step + items.length) % items.length;
      items[next].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  /**
   * Build the item list: the host hook wins, otherwise the defaults.
   * @param {ContextMenuTarget} target
   * @returns {ContextMenuItem[]}
   */
  _itemsFor(target) {
    const hook = this.renderer.options.contextMenuItems;
    if (typeof hook === 'function') {
      try {
        const items = hook(target, this._defaultItems(target));
        return Array.isArray(items) ? items : [];
      } catch (error) {
        console.error('[ContextMenu] contextMenuItems hook failed:', error);
        return [];
      }
    }
    return this._defaultItems(target);
  }

  /** @param {ContextMenuTarget} target @returns {ContextMenuItem[]} */
  _defaultItems(target) {
    const r = this.renderer;
    const readOnly = r.options.readOnly;

    if (target.type === 'block' && target.blockId) {
      const id = target.blockId;
      const view = [
        { label: 'Bring to front', action: () => this.engine.bringToFront(id) },
        { label: 'Center on block', action: () => r.centerOnBlock(id) },
      ];
      if (readOnly) return view;
      const selectedCount = r.selectedBlocks.size;
      return [
        { label: 'Duplicate', action: () => this.engine.duplicateBlock(id) },
        {
          label: 'Add link…',
          action: () => r.startLinkingMode(id),
        },
        { label: 'Manage links…', action: () => r.openLinkEditor(id) },
        { separator: true },
        ...view,
        { separator: true },
        {
          label: selectedCount > 1 ? `Delete ${selectedCount} blocks` : 'Delete',
          action: () => {
            if (selectedCount > 1 && r.selectedBlocks.has(id)) r.deleteSelected();
            else r.deleteBlock(id);
          },
        },
      ];
    }

    const view = [
      { label: 'Select all', action: () => r.selectAll() },
      { label: 'Zoom to fit', action: () => r.zoomToFit() },
      { label: 'Reset view', action: () => r.resetView() },
    ];
    if (readOnly) return view;
    return [
      {
        label: 'New block here',
        action: () => {
          const block = this.engine.createBlock('', 'default', {
            x: Math.round(target.world.x),
            y: Math.round(target.world.y),
          });
          r.selectBlock(block.id);
        },
      },
      { separator: true },
      ...view,
    ];
  }

  /** Place the menu at container-local coordinates, clamped to the container. */
  _position(x, y) {
    if (!this.element) return;
    const container = this.renderer.container;
    const width = this.element.offsetWidth || 180;
    const height = this.element.offsetHeight || 200;
    const maxX = Math.max(0, container.clientWidth - width - 4);
    const maxY = Math.max(0, container.clientHeight - height - 4);
    this.element.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
    this.element.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
  }
}
