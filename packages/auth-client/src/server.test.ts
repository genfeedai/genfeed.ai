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

  it('skips the call without a session cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getBetterAuthServerToken('')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
