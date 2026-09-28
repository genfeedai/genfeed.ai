import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBetterAuthToken: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>();
  return {
    ...actual,
    getBetterAuthToken: mocks.getBetterAuthToken,
    getSession: mocks.getSession,
  };
});

const {
  BetterAuthSessionLookupError,
  BetterAuthTokenUnavailableError,
  getSignedInBetterAuthToken,
} = await import('./session');
const { getBetterAuthTokenContextKey } = await import('./client');

describe('getSignedInBetterAuthToken', () => {
  beforeEach(() => {
    mocks.getBetterAuthToken.mockReset();
    mocks.getSession.mockReset();
  });

  it('resolves null without asking for a token when nobody is signed in', async () => {
    mocks.getSession.mockResolvedValue({ data: null, error: null });

    await expect(getSignedInBetterAuthToken()).resolves.toBeNull();
    expect(mocks.getBetterAuthToken).not.toHaveBeenCalled();
  });

  it('mints the token under the same context key the hook uses', async () => {
    mocks.getSession.mockResolvedValue({
      data: {
        session: { activeOrganizationId: 'org-1', id: 'session-1' },
        user: { id: 'user-1' },
      },
      error: null,
    });
    mocks.getBetterAuthToken.mockResolvedValue('jwt');

    await expect(getSignedInBetterAuthToken()).resolves.toBe('jwt');
    expect(mocks.getBetterAuthToken).toHaveBeenCalledWith(
      getBetterAuthTokenContextKey({
        organizationId: 'org-1',
        sessionId: 'session-1',
        userId: 'user-1',
      }),
      undefined,
    );
  });

  it('rejects when a session exists but no token could be minted', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { id: 'session-1' }, user: { id: 'user-1' } },
      error: null,
    });
    mocks.getBetterAuthToken.mockResolvedValue(null);

    await expect(getSignedInBetterAuthToken()).rejects.toBeInstanceOf(
      BetterAuthTokenUnavailableError,
    );
  });

  it('rejects when the session lookup itself fails', async () => {
    mocks.getSession.mockResolvedValue({
      data: null,
      error: { message: 'Network error', status: 0 },
    });

    await expect(getSignedInBetterAuthToken()).rejects.toBeInstanceOf(
      BetterAuthSessionLookupError,
    );
    expect(mocks.getBetterAuthToken).not.toHaveBeenCalled();
  });
});
