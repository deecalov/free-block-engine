/**
 * Free Block Engine — user-facing strings of the renderer.
 *
 * Every tooltip, label and confirmation the renderer shows comes from this
 * table, so a host can translate the interface by passing `strings` to the
 * renderer options. Placeholders in curly braces are filled by `formatString`.
 *
 * @author Paul Deecalov
 * @license MIT
 */

export const DEFAULT_STRINGS = Object.freeze({
  // Block chrome
  contentPlaceholder: 'Click to edit…',
  manageLinks: 'Manage links',
  deleteBlock: 'Delete block',
  connections: 'Connections:',
  created: 'Created: {date}',
  // Confirmations
  confirmDeleteBlock: 'Delete this block?',
  confirmDeleteBlocks: 'Delete {count} blocks?',
  // Link editor popup
  linkEditorTitle: 'Manage Links',
  edgeEditorTitle: 'Edit Connection',
  addLink: '+ Add New Link',
  labelPlaceholder: 'Label (optional)',
  emptyContent: '(empty)',
  directionForward: 'Direction: anchor to target',
  directionBackward: 'Direction: target to anchor',
  directionBoth: 'Bidirectional',
  deleteLink: 'Delete link',
  close: 'Close',
  // Context menu
  menuDuplicate: 'Duplicate',
  menuAddLink: 'Add link…',
  menuManageLinks: 'Manage links…',
  menuBringToFront: 'Bring to front',
  menuSendToBack: 'Send to back',
  menuCenterOnBlock: 'Center on block',
  menuDelete: 'Delete',
  menuDeleteBlocks: 'Delete {count} blocks',
  menuSelectAll: 'Select all',
  menuZoomToFit: 'Zoom to fit',
  menuResetView: 'Reset view',
  menuNewBlockHere: 'New block here',
});

/** @typedef {Record<keyof typeof DEFAULT_STRINGS, string>} Strings */

/**
 * Fill `{name}` placeholders from `vars`; unknown placeholders are kept.
 *
 * @param {string} template
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function formatString(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}
