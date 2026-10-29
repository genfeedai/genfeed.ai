import {
  UNATTRIBUTED_FORWARDED_HEADER,
  UNATTRIBUTED_FORWARDED_VALUE,
} from '@genfeedai/contracts/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getBetterAuthServerToken } from './server';

describe('getBetterAuthServerToken', () => {
  afterEach(() => {
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
});
