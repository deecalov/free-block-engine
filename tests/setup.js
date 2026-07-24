// Vitest setup: fill the gaps of the jsdom environment.

// jsdom has no PointerEvent — extend MouseEvent with pointer fields.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class PointerEventPolyfill extends window.MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = PointerEventPolyfill;
}

// jsdom throws "not implemented" for confirm.
if (typeof window !== 'undefined') {
  window.confirm = () => true;
}

// jsdom has no matchMedia; the theme option needs one. Tests flip
// `window.__prefersDark` and call `__emitThemeChange()` to simulate the OS.
if (typeof window !== 'undefined' && !window.matchMedia) {
  const listeners = new Set();
  window.__prefersDark = false;
  window.matchMedia = (query) => ({
    media: query,
    get matches() {
      return query.includes('dark') && window.__prefersDark === true;
    },
    addEventListener: (type, listener) => type === 'change' && listeners.add(listener),
    removeEventListener: (type, listener) => type === 'change' && listeners.delete(listener),
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    dispatchEvent: () => false,
    onchange: null,
  });
  window.__emitThemeChange = () => {
    for (const listener of [...listeners]) {
      listener({ matches: window.__prefersDark, media: '(prefers-color-scheme: dark)' });
    }
  };
  window.__themeListenerCount = () => listeners.size;
}
