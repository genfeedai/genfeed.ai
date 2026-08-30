import type { LookupAddress, LookupOptions } from 'node:dns';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());
const httpRequestMock = vi.hoisted(() => vi.fn());
const httpsRequestMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return { ...actual, request: httpRequestMock };
});

vi.mock('node:https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:https')>();
  return { ...actual, request: httpsRequestMock };
});

import {
  DestinationGuardError,
  isBlockedDestinationAddress,
  resolveSafeDestination,
  safeFetch,
} from '@libs/security/destination-guard';

function mockHttpResponse(
  status: number,
  headers: string[] = [],
  chunks: Array<string | Uint8Array> = [],
): void {
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

      const response = Readable.from(chunks);
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
    httpsRequestMock.mockReset();
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

  it('streams byte and string response chunks through the Fetch response', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200, [], [new TextEncoder().encode('hello '), 'world']);

    const response = await safeFetch('http://public.example/asset');

    await expect(response.text()).resolves.toBe('hello world');
  });

  it('settles cancellation while a response stream read is pending', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    let pinnedResponse: Readable | undefined;
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: Readable) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          destroy: (error?: Error) => void;
          end: (body?: unknown) => void;
        };
        request.destroy = (error?: Error) => {
          if (error) request.emit('error', error);
        };
        request.end = vi.fn();

        pinnedResponse = new Readable({ read() {} });
        Object.assign(pinnedResponse, {
          rawHeaders: [],
          statusCode: 200,
          statusMessage: 'OK',
        });
        callback(pinnedResponse);
        return request;
      },
    );

    const response = await safeFetch('http://public.example/asset');
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const pendingRead = reader?.read();
    const cancellation = reader?.cancel();
    const settled = await Promise.race([
      cancellation?.then(() => 'cancelled'),
      new Promise<'timed-out'>((resolve) =>
        setTimeout(() => resolve('timed-out'), 250),
      ),
    ]);
    if (settled === 'timed-out') pinnedResponse?.destroy();

    expect(settled).toBe('cancelled');
    expect(pinnedResponse?.destroyed).toBe(true);
    await expect(pendingRead).resolves.toEqual({
      done: true,
      value: undefined,
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

  it('rejects malformed destination URLs', async () => {
    await expect(resolveSafeDestination('not a url')).rejects.toThrow(
      'must be a valid URL',
    );
  });

  it('rejects URLs that embed credentials', async () => {
    await expect(
      resolveSafeDestination('https://user:secret@public.example/asset'),
    ).rejects.toThrow('must not contain credentials');
  });

  it('rejects allowlist entries that are not bare origins', async () => {
    await expect(
      resolveSafeDestination('http://images.internal:3013/train', {
        allowedOrigins: ['http://images.internal:3013/train'],
        allowPrivateNetwork: true,
      }),
    ).rejects.toThrow('must be an origin');
  });

  it('rejects hostnames that do not resolve', async () => {
    dnsLookupMock.mockResolvedValue([]);

    await expect(
      resolveSafeDestination('https://ghost.example/asset'),
    ).rejects.toThrow('did not resolve');
  });

  it('rejects DNS answers with an unsupported address family', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 0 }]);

    await expect(
      resolveSafeDestination('https://weird.example/asset'),
    ).rejects.toThrow('unsupported address');
  });

  it('rejects an invalid maxRedirects option', async () => {
    await expect(
      safeFetch('http://public.example/asset', {}, { maxRedirects: -1 }),
    ).rejects.toThrow('maxRedirects must be a non-negative integer');
    await expect(
      safeFetch('http://public.example/asset', {}, { maxRedirects: 1.5 }),
    ).rejects.toThrow('maxRedirects must be a non-negative integer');
  });

  it('follows same-origin redirects and marks the response redirected', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: ['location', 'http://public.example/next'],
            statusCode: 302,
            statusMessage: 'Found',
          });
          callback(response);
          return request;
        },
      )
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: [],
            statusCode: 200,
            statusMessage: 'OK',
          });
          callback(response);
          return request;
        },
      );

    const response = await safeFetch('http://public.example/start');

    expect(response.status).toBe(200);
    expect(response.redirected).toBe(true);
    expect(httpRequestMock).toHaveBeenCalledTimes(2);
    expect(String(httpRequestMock.mock.calls[1]?.[0])).toBe(
      'http://public.example/next',
    );
  });

  it('converts a 303 POST redirect into a bodyless GET', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: ['location', 'http://public.example/next'],
            statusCode: 303,
            statusMessage: 'See Other',
          });
          callback(response);
          return request;
        },
      )
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: [],
            statusCode: 200,
            statusMessage: 'OK',
          });
          callback(response);
          return request;
        },
      );

    await safeFetch('http://public.example/start', {
      body: 'payload',
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
    });
  });

  it('treats a redirect status without Location as the final response', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302);

    const response = await safeFetch('http://public.example/start');

    expect(response.status).toBe(302);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
  });

  it('returns redirect responses untouched in manual redirect mode', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302, ['location', 'http://public.example/next']);

    const response = await safeFetch('http://public.example/start', {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(httpRequestMock).toHaveBeenCalledTimes(1);
  });

  it('throws on redirects when redirect mode is error', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302, ['location', 'http://public.example/next']);

    await expect(
      safeFetch('http://public.example/start', { redirect: 'error' }),
    ).rejects.toThrow('Redirects are disabled');
  });

  it('stops after exceeding the redirect budget', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302, ['location', 'http://public.example/next']);

    await expect(
      safeFetch('http://public.example/start', {}, { maxRedirects: 0 }),
    ).rejects.toThrow('exceeded 0 redirects');
  });

  it('rejects redirects with an unparsable location', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(302, ['location', 'http://[invalid']);

    await expect(safeFetch('http://public.example/start')).rejects.toThrow(
      'invalid redirect',
    );
  });

  it('serializes URLSearchParams bodies with the form content type', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset', {
      body: new URLSearchParams({ key: 'value' }),
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      }),
    });
  });

  it('serializes ArrayBuffer and typed-array bodies', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset', {
      body: new TextEncoder().encode('abc').buffer as ArrayBuffer,
      method: 'POST',
    });
    await safeFetch('http://public.example/asset', {
      body: new TextEncoder().encode('abcd'),
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'content-length': '3' }),
    });
    expect(httpRequestMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'content-length': '4' }),
    });
  });

  it('serializes Blob bodies with their content type', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset', {
      body: new Blob(['hello'], { type: 'text/plain' }),
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'content-length': '5',
        'content-type': 'text/plain',
      }),
    });
  });

  it('rejects unsupported request bodies', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await expect(
      safeFetch('http://public.example/asset', {
        body: new ReadableStream(),
        method: 'POST',
      }),
    ).rejects.toThrow('Unsupported request body');
  });

  it('returns a bodyless response for status codes that forbid bodies', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(204);

    const response = await safeFetch('http://public.example/asset');

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('accepts an already-parsed URL instance', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(
      resolveSafeDestination(new URL('https://public.example/asset')),
    ).resolves.toMatchObject({
      address: '93.184.216.34',
      family: 4,
    });
  });

  it('fails closed when the private-network allowlist is empty', async () => {
    await expect(
      resolveSafeDestination('http://10.0.0.5/train', {
        allowedOrigins: [],
        allowPrivateNetwork: true,
      }),
    ).rejects.toThrow('require an explicit origin allowlist');
  });

  it('rejects a pinned lookup for an unexpected hostname', async () => {
    expect.assertions(2);
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset');

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

    requestOptions.agent?.options?.lookup?.(
      'evil.example',
      {},
      (error, address) => {
        expect(error).toBeInstanceOf(DestinationGuardError);
        expect(address).toBe('');
      },
    );
  });

  it('strips hop-by-hop credentials on a cross-origin redirect', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: ['location', 'http://cdn.example/next'],
            statusCode: 302,
            statusMessage: 'Found',
          });
          callback(response);
          return request;
        },
      )
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: [],
            statusCode: 200,
            statusMessage: 'OK',
          });
          callback(response);
          return request;
        },
      );

    await safeFetch('http://public.example/start', {
      headers: {
        authorization: 'Bearer secret',
        cookie: 'session=1',
        'proxy-authorization': 'Basic abc',
      },
    });

    expect(httpRequestMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.not.objectContaining({
        authorization: expect.anything(),
        cookie: expect.anything(),
        'proxy-authorization': expect.anything(),
      }),
    });
  });

  it('converts a 301 POST redirect into a bodyless GET', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: ['location', 'http://public.example/next'],
            statusCode: 301,
            statusMessage: 'Moved Permanently',
          });
          callback(response);
          return request;
        },
      )
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: [],
            statusCode: 200,
            statusMessage: 'OK',
          });
          callback(response);
          return request;
        },
      );

    await safeFetch('http://public.example/start', {
      body: 'payload',
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'GET',
    });
    expect(httpRequestMock.mock.calls[1]?.[1]).not.toMatchObject({
      headers: expect.objectContaining({
        'content-length': expect.anything(),
      }),
    });
    const followOnRequest = httpRequestMock.mock.results[1]?.value as
      | { end?: ReturnType<typeof vi.fn> }
      | undefined;
    expect(followOnRequest?.end).toHaveBeenCalledWith(undefined);
  });

  it('preserves method and body across a 307 redirect', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: ['location', 'http://public.example/next'],
            statusCode: 307,
            statusMessage: 'Temporary Redirect',
          });
          callback(response);
          return request;
        },
      )
      .mockImplementationOnce(
        (
          _url: URL,
          _options: unknown,
          callback: (response: Readable) => void,
        ) => {
          const request = new EventEmitter() as EventEmitter & {
            end: (body?: unknown) => void;
          };
          request.end = vi.fn();
          const response = Readable.from([]);
          Object.assign(response, {
            rawHeaders: [],
            statusCode: 200,
            statusMessage: 'OK',
          });
          callback(response);
          return request;
        },
      );

    await safeFetch('http://public.example/start', {
      body: 'payload',
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'content-length': '7',
      }),
      method: 'POST',
    });
    const followOnRequest = httpRequestMock.mock.results[1]?.value as
      | { end?: ReturnType<typeof vi.fn> }
      | undefined;
    expect(followOnRequest?.end).toHaveBeenCalledWith('payload');
  });

  it('returns a bodyless response for HEAD requests', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    const response = await safeFetch('http://public.example/asset', {
      method: 'HEAD',
    });

    expect(response.body).toBeNull();
  });

  it('serializes a Blob without a content type', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset', {
      body: new Blob(['hello']),
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'content-length': '5',
      }),
    });
    const serializedHeaders = httpRequestMock.mock.calls[0]?.[1] as
      | { headers: Record<string, string> }
      | undefined;
    expect(serializedHeaders?.headers['content-type']).toBeUndefined();
  });

  it('does not overwrite an explicit content-type header', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mockHttpResponse(200);

    await safeFetch('http://public.example/asset', {
      body: new URLSearchParams({ key: 'value' }),
      headers: { 'content-type': 'text/plain' },
      method: 'POST',
    });

    expect(httpRequestMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        'content-type': 'text/plain',
      }),
    });
  });

  it('connects HTTPS destinations through the HTTPS request path', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpsRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: Readable) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          end: (body?: unknown) => void;
        };
        request.end = vi.fn();
        const response = Readable.from([]);
        Object.assign(response, {
          rawHeaders: [],
          statusCode: 200,
          statusMessage: 'OK',
        });
        callback(response);
        return request;
      },
    );

    await expect(
      safeFetch('https://public.example/asset'),
    ).resolves.toBeInstanceOf(Response);
    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
    expect(httpRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a connection error from the pinned request', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & {
        end: (body?: unknown) => void;
      };
      request.end = () => {
        request.emit('error', new Error('ECONNRESET'));
      };
      return request;
    });

    await expect(safeFetch('http://public.example/asset')).rejects.toThrow(
      'ECONNRESET',
    );
  });

  it('defaults a missing status code to 500', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    httpRequestMock.mockImplementation(
      (
        _url: URL,
        _options: unknown,
        callback: (response: Readable) => void,
      ) => {
        const request = new EventEmitter() as EventEmitter & {
          end: (body?: unknown) => void;
        };
        request.end = vi.fn();
        const response = Readable.from([]);
        Object.assign(response, {
          rawHeaders: [],
          statusMessage: 'Unknown',
        });
        callback(response);
        return request;
      },
    );

    const response = await safeFetch('http://public.example/asset');
    expect(response.status).toBe(500);
  });
});
