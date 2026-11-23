// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('@genfeedai/auth-client', () => ({
  getSession: () => getSessionMock(),
}));

import {
  buildLoginRedirectHref,
  redirectToLoginWithoutSession,
} from '@/lib/auth/redirect-without-session';

describe('buildLoginRedirectHref', () => {
  it('carries the page the visitor was heading to', () => {
    expect(buildLoginRedirectHref('/acme/moonrise/library?tab=drafts')).toBe(
      `/login?callbackUrl=${encodeURIComponent('/acme/moonrise/library?tab=drafts')}`,
    );
  });

  it.each(['/', '//attacker.example/x', 'https://attacker.example', '/login'])(
    'drops an unsafe or pointless destination: %s',
    (destination) => {
      expect(buildLoginRedirectHref(destination)).toBe('/login');
    },
  );
});

describe('redirectToLoginWithoutSession', () => {
  const replace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/acme/moonrise/publishing?x=1');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        pathname: '/acme/moonrise/publishing',
        replace,
        search: '?x=1',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a visitor with no session to sign-in, keeping the destination', async () => {
    getSessionMock.mockResolvedValue({ data: null, error: null });

    const redirected = await redirectToLoginWithoutSession(
      new AbortController().signal,
    );

    expect(redirected).toBe(true);
    expect(replace).toHaveBeenCalledWith(
      `/login?callbackUrl=${encodeURIComponent('/acme/moonrise/publishing?x=1')}`,
    );
  });

  it('leaves a visitor with a session where they are', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { id: 's1' } },
      error: null,
    });

    expect(
      await redirectToLoginWithoutSession(new AbortController().signal),
    ).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('never signs anyone out because the session read failed', async () => {
    getSessionMock.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch', status: 0 },
    });

    expect(
      await redirectToLoginWithoutSession(new AbortController().signal),
    ).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing once the gate that asked has gone', async () => {
    const abort = new AbortController();
    getSessionMock.mockImplementation(async () => {
      abort.abort();
      return { data: null, error: null };
    });

    expect(await redirectToLoginWithoutSession(abort.signal)).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
