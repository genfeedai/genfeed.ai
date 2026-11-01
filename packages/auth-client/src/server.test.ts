import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getBetterAuthServerToken,
  resetBetterAuthServerTokenCache,
} from './server';

/** Settles after a macrotask so a second caller can join the pending request. */
function settleLater(outcome: Error | Response): Promise<Response> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (outcome instanceof Error) {
        reject(outcome);
        return;
      }
      resolve(outcome);
    }, 20);
  });
}

describe('getBetterAuthServerToken', () => {
  beforeEach(() => {
    resetBetterAuthServerTokenCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('forwards the session cookie and declares the visitor unknown', async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe('jwt');

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.headers).toEqual({
      cookie: 'session=abc',
      [UNATTRIBUTED_FORWARDED_HEADER]: UNATTRIBUTED_FORWARDED_VALUE,
    });
  });

  it('requests the token from the URL the caller names', async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await getBetterAuthServerToken('session=abc', {
      tokenUrl: 'http://api.internal:3010/v1/auth/token',
    });

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.internal:3010/v1/auth/token');
  });

  it('retries once after a 5xx and reports the failed attempt', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();

    await expect(
      getBetterAuthServerToken('session=abc', { onFailure }),
    ).resolves.toBe('jwt');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledWith({
      attempt: 1,
      reason: 'http',
      status: 503,
    });
  });

  it('retries once after a network error and returns null when both fail', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();

    await expect(
      getBetterAuthServerToken('session=abc', { onFailure }),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.calls.map(([failure]) => failure)).toEqual([
      { attempt: 1, error: 'fetch failed', reason: 'network' },
      { attempt: 2, error: 'fetch failed', reason: 'network' },
    ]);
  });

  it('does not retry a refused session', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();

    await expect(
      getBetterAuthServerToken('session=abc', { onFailure }),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({
      attempt: 1,
      reason: 'http',
      status: 401,
    });
  });

  it('reports a successful answer without a token', async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();

    await expect(
      getBetterAuthServerToken('session=abc', { onFailure }),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith({
      attempt: 1,
      reason: 'missing-token',
      status: 200,
    });
  });

  it('skips the call without a session cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('serves repeat calls for the same session from one request', async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe('jwt');
    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe('jwt');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shares one request between concurrent calls', async () => {
    const fetchMock = vi.fn(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.all([
        getBetterAuthServerToken('session=abc'),
        getBetterAuthServerToken('session=abc'),
        getBetterAuthServerToken('session=abc'),
      ]),
    ).resolves.toEqual(['jwt', 'jwt', 'jwt']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops at a fetch cut off by the end of its prerender', async () => {
    const prerenderEnded = Object.assign(
      new Error(
        'During prerendering, fetch() rejects when the prerender is complete.',
      ),
      { digest: 'HANGING_PROMISE_REJECTION' },
    );
    const fetchMock = vi.fn(async () => {
      throw prerenderEnded;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onFailure = vi.fn();

    await expect(
      getBetterAuthServerToken('session=abc', { onFailure }),
    ).resolves.toBeNull();

    expect(onFailure.mock.calls.map(([failure]) => failure)).toEqual([
      { attempt: 1, reason: 'prerender-ended' },
    ]);
  });

  it('asks for itself when the shared request it joined was cut off by its prerender', async () => {
    const prerenderEnded = Object.assign(new Error('prerender complete'), {
      digest: 'HANGING_PROMISE_REJECTION',
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => settleLater(prerenderEnded))
      .mockImplementationOnce(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.all([
        getBetterAuthServerToken('session=abc'),
        getBetterAuthServerToken('session=abc'),
      ]),
    ).resolves.toEqual([null, 'jwt']);
  });

  it('asks for itself when the shared request it joined failed on the network', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => settleLater(new TypeError('fetch failed')))
      .mockImplementationOnce(() => settleLater(new TypeError('fetch failed')))
      .mockImplementationOnce(async () => Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.all([
        getBetterAuthServerToken('session=abc'),
        getBetterAuthServerToken('session=abc'),
      ]),
    ).resolves.toEqual([null, 'jwt']);
  });

  it('does not ask again for a joined request that was refused', async () => {
    const fetchMock = vi.fn(() =>
      settleLater(new Response(null, { status: 401 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      Promise.all([
        getBetterAuthServerToken('session=abc'),
        getBetterAuthServerToken('session=abc'),
      ]),
    ).resolves.toEqual([null, null]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never shares a token between different sessions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'jwt-a' }))
      .mockResolvedValueOnce(Response.json({ token: 'jwt-b' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('session=a')).resolves.toBe('jwt-a');
    await expect(getBetterAuthServerToken('session=b')).resolves.toBe('jwt-b');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks again after 30 seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ token: 'jwt-1' }))
      .mockResolvedValueOnce(Response.json({ token: 'jwt-2' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe(
      'jwt-1',
    );
    vi.advanceTimersByTime(30_001);
    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe(
      'jwt-2',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed exchange', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ token: 'jwt' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('session=abc')).resolves.toBeNull();
    await expect(getBetterAuthServerToken('session=abc')).resolves.toBe('jwt');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
