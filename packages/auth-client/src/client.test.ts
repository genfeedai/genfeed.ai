import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('better-auth/client/plugins', () => ({
  jwtClient: vi.fn(() => 'jwt-plugin'),
  magicLinkClient: vi.fn(() => 'magic-link-plugin'),
}));

vi.mock('better-auth/react', () => ({
  createAuthClient: vi.fn(() => ({
    $fetch: fetchMock,
    getSession: vi.fn(),
    signIn: {},
    signOut: vi.fn(),
    signUp: {},
    useSession: vi.fn(),
  })),
}));

import { getBetterAuthToken } from './client';

describe('getBetterAuthToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('reads a direct token response from Better Auth fetch', async () => {
    fetchMock.mockResolvedValue({ token: 'direct-token' });

    await expect(getBetterAuthToken()).resolves.toBe('direct-token');
  });

  it('reads a nested data token response for wrapped fetch clients', async () => {
    fetchMock.mockResolvedValue({ data: { token: 'nested-token' } });

    await expect(getBetterAuthToken()).resolves.toBe('nested-token');
  });

  it('returns null when the token endpoint has no active session token', async () => {
    fetchMock.mockResolvedValue({ data: null });

    await expect(getBetterAuthToken()).resolves.toBeNull();
  });
});
