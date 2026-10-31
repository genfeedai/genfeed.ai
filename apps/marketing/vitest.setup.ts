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

// jsdom does not implement matchMedia either, and components that branch on
// `prefers-reduced-motion` or a width query call it during layout effects.
// Everything reports "no match": a test that cares about a specific media
// state stubs the answer it needs, and every other test renders the
// conservative branch rather than the decorative one.
if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => ({
    addEventListener: () => {
      /* noop mock */
    },
    addListener: () => {
      /* noop mock */
    },
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {
      /* noop mock */
    },
    removeListener: () => {
      /* noop mock */
    },
  })) as unknown as typeof window.matchMedia;
}

// jsdom does not implement IntersectionObserver, and components that defer work
// until an element scrolls into view construct one during a layout effect.
// Nothing ever intersects here: a test that cares captures the callback through
// its own stub, and every other test renders the not-yet-visible branch.
globalThis.IntersectionObserver = class IntersectionObserver {
  disconnect() {
    /* noop mock */
  }
  observe() {
    /* noop mock */
  }
  takeRecords() {
    return [];
  }
  unobserve() {
    /* noop mock */
  }
} as unknown as typeof globalThis.IntersectionObserver;
if (typeof window !== 'undefined') {
  window.IntersectionObserver = globalThis.IntersectionObserver;
}
