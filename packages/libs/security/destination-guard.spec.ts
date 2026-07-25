import type { LookupAddress, LookupOptions } from 'node:dns';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());
const httpRequestMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, request: httpRequestMock };
});

import {
  DestinationGuardError,
  isBlockedDestinationAddress,
  resolveSafeDestination,
  safeFetch,
} from '@libs/security/destination-guard';

function mockHttpResponse(status: number, headers: string[] = []): void {
  httpRequestMock.mockImplementation(
    (_url: URL, _options: unknown, callback: (response: Readable) => void) => {
      const request = new EventEmitter() as EventEmitter & {
        destroy: (error?: Error) => void;
        end: (body?: unknown) => void;
      };
      request.destroy = (error?: Error) => {
        if (error) request.emit('error', error);
      };
      request.end = vi.fn();

      const response = Readable.from([]);
      Object.assign(response, {
        rawHeaders: headers,
        statusCode: status,
        statusMessage: status === 302 ? 'Found' : 'OK',
      });
      callback(response);
      return request;
    },
  );
}

describe('destination guard', () => {
  afterEach(() => {
    dnsLookupMock.mockReset();
    httpRequestMock.mockReset();
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '::1',
    '::7f00:1',
    '2001:0:1::1',
    '2002:a9fe:a9fe::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
  ])('rejects blocked destination address %s', async (address) => {
    expect(isBlockedDestinationAddress(address)).toBe(true);

    const url = address.includes(':')
      ? `https://[${address}]/asset`
      : `https://${address}/asset`;
    await expect(resolveSafeDestination(url)).rejects.toBeInstanceOf(
      DestinationGuardError,
    );
  });

  it('rejects non-http schemes', async () => {
    await expect(resolveSafeDestination('file:///etc/passwd')).rejects.toThrow(
      'http or https',
    );
  });

  it('rejects a hostname when any DNS answer is private', async () => {
    dnsLookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    await expect(
      resolveSafeDestination('https://mixed.example/asset'),
    ).rejects.toThrow('private or reserved');
  });

  it('pins a passing public destination to the checked address', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(
      resolveSafeDestination('https://public.example/asset'),
    ).resolves.toMatchObject({
      address: '93.184.216.34',
      family: 4,
    });
  });

  it('connects through an agent pinned to the checked DNS answer', async () => {
    expect.assertions(7);
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await expect(
      safeFetch('http://public.example/asset'),
    ).resolves.toBeInstanceOf(Response);

    const requestOptions = httpRequestMock.mock.calls[0]?.[1] as {
      agent?: {
        options?: {
          lookup?: (
            hostname: string,
            options: LookupOptions,
            callback: (
              error: Error | null,
              address: string | LookupAddress[],
              family?: number,
            ) => void,
          ) => void;
        };
      };
    };
    const pinnedLookup = requestOptions.agent?.options?.lookup;
    expect(pinnedLookup).toBeTypeOf('function');

    pinnedLookup?.('public.example', {}, (error, address, family) => {
      expect(error).toBeNull();
      expect(address).toBe('93.184.216.34');
      expect(family).toBe(4);
    });

    pinnedLookup?.('public.example', { all: true }, (error, addresses) => {
      expect(error).toBeNull();
      expect(addresses).toEqual([
        {
          address: '93.184.216.34',
          family: 4,
        },
      ]);
    });
  });

  it('preserves fetch-compatible request metadata', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    const response = await safeFetch('http://public.example/asset', {
      body: 'hello',
      method: 'POST',
    });

    expect(response.url).toBe('http://public.example/asset');
    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'accept-encoding': 'identity',
        'content-length': '5',
      },
    });
  });

  it('rechecks redirect destinations before issuing the next request', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302, [
      'location',
      'http://169.254.169.254/latest/meta-data',
    ]);

    await expect(safeFetch('http://public.example/start')).rejects.toThrow(
      'private or reserved',
    );
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
  });

  it('allows a private destination only behind an exact origin allowlist', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(
      resolveSafeDestination('http://images.internal:3013/train', {
        allowedOrigins: ['http://images.internal:3013'],
        allowPrivateNetwork: true,
      }),
    ).resolves.toMatchObject({ address: '10.0.0.5', family: 4 });

    await expect(
      resolveSafeDestination('http://metadata.internal/latest', {
        allowedOrigins: ['http://images.internal:3013'],
        allowPrivateNetwork: true,
      }),
    ).rejects.toThrow('origin is not allowed');
  });

  it('fails closed when private-network access has no origin allowlist', async () => {
    await expect(
      resolveSafeDestination('http://10.0.0.5/train', {
        allowPrivateNetwork: true,
      }),
    ).rejects.toThrow('require an explicit origin allowlist');
  });
});
