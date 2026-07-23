/**
 * Free Block Engine — Block model.
 *
 * @author Paul Deecalov
 * @license MIT
 */

/** Default block size in pixels (single source of truth for engine, import and docs). */
export const DEFAULT_BLOCK_SIZE = Object.freeze({ width: 250, height: 150 });

/**
 * A single content block with typed, optionally labelled links to other blocks.
 */
export class Block {
  /**
   * @param {string} id Unique block id.
   * @param {string} [content] Text content.
   * @param {string} [type] Block type ('default', 'note', 'task', ...).
   */
  constructor(id, content = '', type = 'default') {
    this.id = id;
    this.content = content;
    this.type = type;
    /** @type {Map<string, {type: string, label: string, createdAt: string}>} */
    this.links = new Map();
    this.position = { x: 0, y: 0 };
    this.size = { ...DEFAULT_BLOCK_SIZE };
    /** Arbitrary user data preserved by export/import. @type {Record<string, unknown>} */
    this.data = {};
    const now = new Date().toISOString();
    this.metadata = { createdAt: now, updatedAt: now };
  }

  /** Refresh the updatedAt timestamp. */
  touch() {
    this.metadata.updatedAt = new Date().toISOString();
  }

  /** @param {string} content */
  setContent(content) {
    this.content = content;
    this.touch();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
    this.touch();
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {
    this.size.width = width;
    this.size.height = height;
    this.touch();
  }

  /**
   * @param {string} blockId Target block id.
   * @param {string} [linkType] 'single' or 'double'.
   * @param {string} [label] Optional connection label.
   */
  addLink(blockId, linkType = 'single', label = '') {
    this.links.set(blockId, {
      type: linkType,
      label,
      createdAt: new Date().toISOString(),
    });
    this.touch();
  }

  /** @param {string} blockId */
  removeLink(blockId) {
    this.links.delete(blockId);
    this.touch();
  }

  /** @param {string} blockId */
  hasLink(blockId) {
    return this.links.has(blockId);
  }

  /**
   * @param {string} blockId
   * @returns {{type: string, label: string, createdAt: string}|null}
   */
  getLinkMeta(blockId) {
    return this.links.get(blockId) || null;
  }

  /**
   * @param {string} blockId
   * @returns {string|null}
   */
  getLinkType(blockId) {
    const link = this.links.get(blockId);
    return link ? link.type : null;
  }

  /** Serializable representation of the block (including custom `data`). */
  toJSON() {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      links: Array.from(this.links.entries()).map(([id, meta]) => ({ id, ...meta })),
      position: { ...this.position },
      size: { ...this.size },
      data: this.data,
      metadata: { ...this.metadata },
    };
  }

  /**
   * Restore a block from its serialized form. Tolerates missing fields, the
   * legacy links format (plain array of ids) and the legacy `customData` field.
   *
   * @param {object} raw Parsed JSON object.
   * @returns {Block}
   */
  static fromJSON(raw) {
    const block = new Block(String(raw.id), raw.content ?? '', raw.type ?? 'default');

    if (Array.isArray(raw.links)) {
      for (const link of raw.links) {
        if (typeof link === 'string') {
          block.links.set(link, { type: 'single', label: '', createdAt: new Date().toISOString() });
        } else if (link && link.id != null) {
          block.links.set(String(link.id), {
            type: link.type || 'single',
            label: link.label || '',
            createdAt: link.createdAt || new Date().toISOString(),
          });
        }
      }
    }

    if (raw.position && Number.isFinite(raw.position.x) && Number.isFinite(raw.position.y)) {
      block.position = { x: raw.position.x, y: raw.position.y };
    }
    if (raw.size && Number.isFinite(raw.size.width) && Number.isFinite(raw.size.height)) {
      block.size = { width: raw.size.width, height: raw.size.height };
    }

    const data = raw.data ?? raw.customData;
    if (data && typeof data === 'object') {
      block.data = data;
    }

    if (raw.metadata && raw.metadata.createdAt) {
      block.metadata = {
        createdAt: raw.metadata.createdAt,
        updatedAt: raw.metadata.updatedAt || raw.metadata.createdAt,
      };
    }

    return block;
  }
}
