import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver, but Radix size-aware primitives use
// it during layout effects. Keep this a class so Vitest's fork pool can invoke
// it as a constructor.
globalThis.ResizeObserver = class ResizeObserver {
  disconnect() {
    /* noop mock */
  }
  observe() {
    /* noop mock */
  }
  unobserve() {
    /* noop mock */
  }
} as unknown as typeof globalThis.ResizeObserver;
window.ResizeObserver = globalThis.ResizeObserver;
