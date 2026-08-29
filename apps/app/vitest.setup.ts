import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './tests/server-only.stub';

// jsdom ships no IntersectionObserver, so anything rendering `LazyLoad` (via
// `useIntersectionObserver`) throws on mount. Mirrors the stub in
// packages/ui/src/components/tests/setup.ts — must be a class, not vi.fn(), to
// work as a constructor in the vitest 4 fork pool.
global.IntersectionObserver = class IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect() {
    /* noop mock */
  }
  observe() {
    /* noop mock */
  }
  unobserve() {
    /* noop mock */
  }
  takeRecords() {
    return [];
  }
} as unknown as typeof globalThis.IntersectionObserver;
window.IntersectionObserver = global.IntersectionObserver;

// Node 22+ ships an experimental global `localStorage`/`sessionStorage`
// accessor that shadows jsdom's own Storage implementation, because
// vitest-environment-jsdom aliases `window` to the Node global object rather
// than a standalone jsdom window. Node's accessor stays inert (returns
// `undefined`) unless the process is launched with `--localstorage-file`, so
// any unguarded `localStorage.setItem(...)` throws
// `Cannot read properties of undefined`. Provide a real in-memory Storage so
// persisted zustand stores, storage-backed hooks, and analytics dedupe
// utilities behave the way they do in a browser.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => (key in store ? store[key] : null),
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
  } as unknown as Storage;
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: createMemoryStorage(),
  writable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: createMemoryStorage(),
  writable: true,
});

// Explicitly unmount React trees and clear the jsdom document after every test.
// RTL auto-cleanup already runs when a global afterEach exists, but making it
// explicit (plus dropping detached body/head nodes) bounds per-file DOM growth
// in the reused forks worker, which is the main driver of the shard OOM.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.head.replaceChildren();
});
