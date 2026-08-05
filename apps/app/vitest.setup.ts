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

// Explicitly unmount React trees and clear the jsdom document after every test.
// RTL auto-cleanup already runs when a global afterEach exists, but making it
// explicit (plus dropping detached body/head nodes) bounds per-file DOM growth
// in the reused forks worker, which is the main driver of the shard OOM.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.head.replaceChildren();
});
