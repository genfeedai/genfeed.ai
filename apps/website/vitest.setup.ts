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
// Server-side files (route handlers) opt into `@vitest-environment node`,
// where there is no `window`. Under jsdom `window` *is* `globalThis`, so this
// assignment is a no-op there and only ever mattered as a crash here.
if (typeof window !== 'undefined') {
  window.ResizeObserver = globalThis.ResizeObserver;
}
