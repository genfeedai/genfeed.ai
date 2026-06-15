import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './tests/server-only.stub';

// Explicitly unmount React trees and clear the jsdom document after every test.
// RTL auto-cleanup already runs when a global afterEach exists, but making it
// explicit (plus dropping detached body/head nodes) bounds per-file DOM growth
// in the reused forks worker, which is the main driver of the shard OOM.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.head.replaceChildren();
});
