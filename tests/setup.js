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
