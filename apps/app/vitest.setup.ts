import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import './tests/server-only.stub';

// Global: stop the real Better Auth browser client from mounting. `@genfeedai/
// auth-client` creates a module-level `createAuthClient` singleton whose
// nanostores session store schedules a broadcast-channel refresh timer. That
// timer fires AFTER a test's jsdom `window` is torn down, throwing
// "ReferenceError: window is not defined" from cleanupBroadcastSetup — which
// vitest v4 counts as a fatal unhandled error and fails the whole run even when
// every test passes. Mocking createAuthClient here neutralises the timer across
// the entire app suite; per-file hook mocks (@genfeedai/auth-client/react) are a
// different module and still take precedence where present.
vi.mock('better-auth/react', () => ({
  createAuthClient: () => ({
    $fetch: vi.fn().mockResolvedValue({ data: null }),
    getSession: vi.fn().mockResolvedValue({ data: null }),
    signIn: { email: vi.fn(), magicLink: vi.fn(), social: vi.fn() },
    signOut: vi.fn(),
    signUp: { email: vi.fn() },
    useSession: vi.fn(() => ({ data: null, error: null, isPending: false })),
  }),
}));

// Explicitly unmount React trees and clear the jsdom document after every test.
// RTL auto-cleanup already runs when a global afterEach exists, but making it
// explicit (plus dropping detached body/head nodes) bounds per-file DOM growth
// in the reused forks worker, which is the main driver of the shard OOM.
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  document.head.replaceChildren();
});
