/**
 * Free Block Engine — plain-text reading of contenteditable elements.
 *
 * Browsers turn Enter inside a contenteditable element into markup rather
 * than a newline character: Chrome wraps the new line in a `<div>`, Firefox
 * inserts a `<br>`. `textContent` drops both, so a block edited across
 * several lines used to be saved as one line. `editableText()` mirrors what
 * `innerText` returns for that markup, but is deterministic and needs no
 * layout (jsdom has neither `innerText` nor layout).
 *
 * @author Paul Deecalov
 * @license MIT
 */

/** Elements that start a new line, the way `innerText` treats them. */
const BLOCK_TAGS = new Set([
  'DIV',
  'P',
  'LI',
  'UL',
  'OL',
  'BLOCKQUOTE',
  'PRE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'TR',
  'SECTION',
  'ARTICLE',
]);

/**
 * Plain text of an editable element: text nodes as they are, `<br>` and
 * block boundaries as `\n`, everything else flattened. One trailing newline
 * is dropped — browsers keep a padding `<br>` or block at the end of the
 * editor that does not represent a line the user typed.
 *
 * @param {Node} root
 * @returns {string}
 */
export function editableText(root) {
  let out = '';
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        out += child.nodeValue;
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.tagName === 'BR') {
        out += '\n';
        continue;
      }
      const block = BLOCK_TAGS.has(child.tagName);
      if (block && out !== '' && !out.endsWith('\n')) out += '\n';
      visit(child);
      if (block && !out.endsWith('\n')) out += '\n';
    }
  };
  visit(root);
  return out.endsWith('\n') ? out.slice(0, -1) : out;
}

/**
 * The `contenteditable` value to use for block text: `plaintext-only` where
 * the browser supports it (Enter inserts `\n`, pasted markup is stripped),
 * otherwise `true`. Setting an unsupported value would make the element
 * read-only, hence the probe.
 *
 * @param {Document} doc
 * @returns {'plaintext-only'|'true'}
 */
export function editableMode(doc) {
  const probe = doc.createElement('div');
  try {
    probe.contentEditable = 'plaintext-only';
  } catch {
    return 'true';
  }
  return probe.getAttribute('contenteditable') === 'plaintext-only' ? 'plaintext-only' : 'true';
}
