import { describe, it, expect } from 'vitest';
import { editableText, editableMode } from '../src/editableText.js';

/** An element with the given inner markup, the way a browser leaves it after editing. */
function edited(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('editableText', () => {
  it('keeps plain text and newline characters untouched', () => {
    expect(editableText(edited('line 1\n\nline 3'))).toBe('line 1\n\nline 3');
  });

  it('turns Chrome-style <div> paragraphs into newlines', () => {
    expect(editableText(edited('first<div>second</div><div>third</div>'))).toBe(
      'first\nsecond\nthird'
    );
  });

  it('turns Firefox-style <br> breaks into newlines', () => {
    expect(editableText(edited('first<br>second<br>'))).toBe('first\nsecond');
  });

  it('preserves empty lines', () => {
    expect(editableText(edited('first<div><br></div><div>third</div>'))).toBe('first\n\nthird');
  });

  it('flattens pasted rich markup to its text', () => {
    expect(editableText(edited('<b>bold</b> and <i>italic</i><div><span>next</span></div>'))).toBe(
      'bold and italic\nnext'
    );
  });

  it('returns an empty string for an empty editor', () => {
    expect(editableText(edited(''))).toBe('');
    expect(editableText(edited('<div><br></div>'))).toBe('');
  });
});

describe('editableMode', () => {
  /** A document whose elements reflect (or reject) the contentEditable setter. */
  function docWithSetter(set) {
    return {
      createElement() {
        const probe = document.createElement('div');
        Object.defineProperty(probe, 'contentEditable', {
          set(value) {
            set(probe, value);
          },
          get() {
            return probe.getAttribute('contenteditable');
          },
        });
        return probe;
      },
    };
  }

  it('falls back to "true" where the attribute is not reflected (jsdom)', () => {
    expect(editableMode(document)).toBe('true');
  });

  it('reports plaintext-only when the browser reflects it', () => {
    const doc = docWithSetter((probe, value) => probe.setAttribute('contenteditable', value));
    expect(editableMode(doc)).toBe('plaintext-only');
  });

  it('falls back to "true" when the setter rejects the value', () => {
    const doc = docWithSetter(() => {
      throw new SyntaxError('unsupported');
    });
    expect(editableMode(doc)).toBe('true');
  });
});
