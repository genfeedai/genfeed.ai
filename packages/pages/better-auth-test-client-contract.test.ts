import { authClient } from '@genfeedai/auth-client';
import { describe, expect, it, vi } from 'vitest';

// The real Better Auth session atom schedules a delayed nanostores cleanup
// that touches `window` after jsdom teardown and fails the run with an
// unhandled error. vitest.config.ts must keep resolving `better-auth/react`
// to the timer-free stub.
describe('pages Better Auth test client', () => {
  it('resolves better-auth/react to the timer-free stub', () => {
    expect(vi.isMockFunction(authClient.useSession)).toBe(true);
  });
});
