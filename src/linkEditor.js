/**
 * Free Block Engine — link editor popup.
 *
 * Two modes:
 *  - block mode: manage all connections of one block (open via the 🔗 action);
 *  - edge mode: edit a single connection (open by clicking a line on the canvas).
 * Supports changing direction (→ ← ↔), editing the label and deleting the link.
 *
 * @author Paul Deecalov
 * @license MIT
 */

export class LinkEditorPopup {
  /**
   * @param {import('./blockEngine.js').BlockEngine} engine
   * @param {import('./blockRenderer.js').BlockRenderer} renderer
   */
  constructor(engine, renderer) {
    this.engine = engine;
    this.renderer = renderer;
    this.element = null;
    this._mode = null;
  }

  get isOpen() {
    return this.element !== null;
  }

  /** @param {Node} node */
  contains(node) {
    return this.element !== null && this.element.contains(node);
  }

  /** The id of the block whose editor is open (block mode only). */
  get blockId() {
    return this._mode && this._mode.kind === 'block' ? this._mode.blockId : null;
  }

  /**
   * Open the editor listing all connections of a block.
   * @param {string} blockId
   */
  openForBlock(blockId) {
    const block = this.engine.getBlock(blockId);
    if (!block) return;
    this.close();
    this._mode = { kind: 'block', blockId };
    this._createPopup();
    this.refresh();
    const screen = this.renderer.worldToScreen({
      x: block.position.x + block.size.width,
      y: block.position.y,
    });
    this._position(screen.x + 10, screen.y);
  }

  /**
   * Open the editor for a single connection.
   * @param {string} fromId Canonical source id.
   * @param {string} toId Canonical target id.
   * @param {{clientX: number, clientY: number}} pointer Screen position of the click.
   */
  openForEdge(fromId, toId, pointer) {
    if (!this.engine.getLinkInfo(fromId, toId)) return;
    this.close();
    this._mode = { kind: 'edge', fromId, toId };
    this._createPopup();
    this.refresh();
    const rect = this.renderer.container.getBoundingClientRect();
    this._position(pointer.clientX - rect.left + 8, pointer.clientY - rect.top + 8);
  }

  close() {
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    this._mode = null;
  }

  /** Rebuild the popup content from the current engine state. */
  refresh() {
    if (!this.element || !this._mode) return;
    this.element.innerHTML = '';

    const doc = this.element.ownerDocument;
    const title = doc.createElement('h3');
    title.textContent = this._mode.kind === 'block' ? 'Manage Links' : 'Edit Connection';
    this.element.appendChild(title);

    const closeBtn = doc.createElement('button');
    closeBtn.className = 'link-editor-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.onclick = () => this.close();
    this.element.appendChild(closeBtn);

    if (this._mode.kind === 'block') {
      this._renderBlockMode(doc);
    } else {
      this._renderEdgeMode(doc);
    }
  }

  _renderBlockMode(doc) {
    const block = this.engine.getBlock(this._mode.blockId);
    if (!block) {
      this.close();
      return;
    }

    const list = doc.createElement('div');
    list.className = 'link-editor-list';

    for (const targetId of block.links.keys()) {
      const target = this.engine.getBlock(targetId);
      if (target) {
        list.appendChild(this._createItem(block.id, targetId, 'outgoing'));
      }
    }
    for (const source of this.engine.getIncomingLinks(block.id)) {
      if (!block.hasLink(source.id)) {
        list.appendChild(this._createItem(block.id, source.id, 'incoming'));
      }
    }
    this.element.appendChild(list);

    if (!this.renderer.options.readOnly) {
      const addSection = doc.createElement('div');
      addSection.className = 'link-editor-add';
      const addButton = doc.createElement('button');
      addButton.className = 'link-editor-add-button';
      addButton.textContent = '+ Add New Link';
      addButton.onclick = () => {
        const sourceId = this._mode.blockId;
        this.close();
        this.renderer.startLinkingMode(sourceId);
      };
      addSection.appendChild(addButton);
      this.element.appendChild(addSection);
    }
  }

  _renderEdgeMode(doc) {
    const { fromId, toId } = this._mode;
    if (!this.engine.getLinkInfo(fromId, toId)) {
      this.close();
      return;
    }
    const list = doc.createElement('div');
    list.className = 'link-editor-list';
    list.appendChild(this._createItem(fromId, toId, 'outgoing'));
    this.element.appendChild(list);
  }

  /**
   * Build one connection item. `anchorId` is the block the popup "belongs" to;
   * for outgoing items the pair is (anchorId -> otherId), for incoming items
   * the stored link is (otherId -> anchorId).
   *
   * @param {string} anchorId
   * @param {string} otherId
   * @param {'outgoing'|'incoming'} direction
   */
  _createItem(anchorId, otherId, direction) {
    const doc = this.element.ownerDocument;
    const engine = this.engine;
    const other = engine.getBlock(otherId);
    const info = engine.getLinkInfo(anchorId, otherId);

    const item = doc.createElement('div');
    item.className = 'link-editor-item';

    const header = doc.createElement('div');
    header.className = 'link-editor-item-header';
    const title = doc.createElement('div');
    title.className = 'link-editor-item-title';
    const arrow = direction === 'outgoing' ? '\u2192' : '\u2190';
    title.textContent = `${arrow} ${otherId.slice(0, 14)}...`;
    header.appendChild(title);
    item.appendChild(header);

    const content = doc.createElement('div');
    content.className = 'link-editor-item-content';
    content.textContent = (other && other.content) || '(empty)';
    item.appendChild(content);

    const actions = doc.createElement('div');
    actions.className = 'link-editor-item-actions';

    const currentShape = this._pairShape(anchorId, otherId);
    const readOnly = this.renderer.options.readOnly;

    const addTypeButton = (symbol, shape, titleText) => {
      const btn = doc.createElement('button');
      btn.textContent = symbol;
      btn.title = titleText;
      btn.classList.toggle('active', currentShape === shape);
      btn.disabled = readOnly;
      btn.onclick = () => {
        engine.updateLinkType(anchorId, otherId, shape);
        this.refresh();
      };
      actions.appendChild(btn);
    };

    addTypeButton('\u2192', 'single', 'Direction: anchor to target');
    addTypeButton('\u2190', 'reverse', 'Direction: target to anchor');
    addTypeButton('\u2194', 'double', 'Bidirectional');

    const deleteBtn = doc.createElement('button');
    deleteBtn.className = 'delete';
    deleteBtn.textContent = '\u2715';
    deleteBtn.title = 'Delete link';
    deleteBtn.disabled = readOnly;
    deleteBtn.onclick = () => {
      engine.unlinkBlocks(anchorId, otherId);
      if (this._mode && this._mode.kind === 'edge') {
        this.close();
      } else {
        this.refresh();
      }
    };
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    const label = doc.createElement('input');
    label.className = 'link-editor-label';
    label.type = 'text';
    label.placeholder = 'Label (optional)';
    label.value = (info && info.label) || '';
    label.disabled = readOnly;
    label.addEventListener('change', () => {
      engine.setLinkLabel(anchorId, otherId, label.value.trim());
    });
    item.appendChild(label);

    return item;
  }

  /**
   * Shape of the pair relative to (anchorId, otherId):
   * 'single' = anchor→other, 'reverse' = other→anchor, 'double' = both.
   */
  _pairShape(anchorId, otherId) {
    const info = this.engine.getLinkInfo(anchorId, otherId);
    if (!info) return null;
    if (info.type === 'double') return 'double';
    return info.from === anchorId ? 'single' : 'reverse';
  }

  _createPopup() {
    const doc = this.renderer.container.ownerDocument;
    const el = doc.createElement('div');
    el.className = 'link-editor-popup';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.renderer.container.appendChild(el);
    this.element = el;
  }

  /** Place the popup at container-local coordinates, clamped to the container. */
  _position(x, y) {
    if (!this.element) return;
    const container = this.renderer.container;
    const width = this.element.offsetWidth || 260;
    const height = this.element.offsetHeight || 200;
    const maxX = Math.max(0, container.clientWidth - width - 8);
    const maxY = Math.max(0, container.clientHeight - height - 8);
    this.element.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
    this.element.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
  }
}
