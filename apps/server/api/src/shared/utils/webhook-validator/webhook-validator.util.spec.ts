import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

import {
  assertSafeWebhookHeaders,
  assertSafeWebhookUrl,
  BLOCKED_WEBHOOK_HEADERS,
  createSafeWebhookHttpsAgent,
} from './webhook-validator.util';

// ---------------------------------------------------------------------------
// assertSafeWebhookUrl — scheme checks
// ---------------------------------------------------------------------------

describe('assertSafeWebhookUrl — scheme', () => {
  it('throws for non-URL strings', async () => {
    await expect(assertSafeWebhookUrl('not-a-url')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws for http:// URLs', async () => {
    await expect(
      assertSafeWebhookUrl('http://hooks.example.com/webhook'),
    ).rejects.toThrow('HTTPS');
  });

  it('accepts https:// URLs pointing to a public IPv4 literal', async () => {
    await expect(
      assertSafeWebhookUrl('https://1.1.1.1/webhook'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// assertSafeWebhookUrl — private IPv4 literals
// ---------------------------------------------------------------------------

describe('assertSafeWebhookUrl — blocked IPv4 literals', () => {
  const blocked = [
    'https://10.0.0.1/hook',
    'https://10.255.255.255/hook',
    'https://172.16.0.1/hook',
    'https://172.31.255.255/hook',
    'https://192.168.0.1/hook',
    'https://192.168.255.255/hook',
    'https://127.0.0.1/hook',
    'https://127.1.2.3/hook',
    'https://169.254.169.254/hook',
    'https://0.0.0.1/hook',
    'https://224.0.0.1/hook',
    'https://240.0.0.1/hook',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      await expect(assertSafeWebhookUrl(url)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// assertSafeWebhookUrl — blocked IPv6 literals
// ---------------------------------------------------------------------------

describe('assertSafeWebhookUrl — blocked IPv6 literals', () => {
  const blocked = [
    'https://[::1]/hook',
    'https://[fe80::1]/hook',
    'https://[fc00::1]/hook',
    'https://[fd00::1]/hook',
    'https://[ff02::1]/hook',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, async () => {
      await expect(assertSafeWebhookUrl(url)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// assertSafeWebhookUrl — DNS resolution
// ---------------------------------------------------------------------------

describe('assertSafeWebhookUrl — DNS resolution', () => {
  afterEach(() => {
    dnsLookupMock.mockReset();
  });

  it('throws when DNS lookup fails', async () => {
    dnsLookupMock.mockRejectedValue(new Error('ENOTFOUND'));

    await expect(
      assertSafeWebhookUrl('https://not-a-real-host.internal/hook'),
    ).rejects.toThrow('could not be resolved');
  });

  it('blocks hostname resolving to private RFC1918 address', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '192.168.1.100', family: 4 }]);

    await expect(
      assertSafeWebhookUrl('https://internal.example.com/hook'),
    ).rejects.toThrow('private or reserved');
  });

  it('blocks hostname resolving to AWS metadata endpoint 169.254.169.254', async () => {
    dnsLookupMock.mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(
      assertSafeWebhookUrl('https://metadata.evil.com/hook'),
    ).rejects.toThrow('private or reserved');
  });

  it('allows hostname resolving to public address', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(
      assertSafeWebhookUrl('https://hooks.example.com/webhook'),
    ).resolves.toBeUndefined();
  });

  it('blocks hostname when any resolved address is private or reserved', async () => {
    dnsLookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    await expect(
      assertSafeWebhookUrl('https://multi.example.com/webhook'),
    ).rejects.toThrow('private or reserved');
  });

  it('pins the validated address for webhook requests', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const agent = await createSafeWebhookHttpsAgent(
      'https://hooks.example.com/webhook',
    );
    const lookup = agent.options.lookup;

    expect(lookup).toBeTypeOf('function');

    await new Promise<void>((resolve, reject) => {
      lookup?.('hooks.example.com', {}, (error, address, family) => {
        if (error) {
          reject(error);
          return;
        }

        expect(address).toBe('93.184.216.34');
        expect(family).toBe(4);
        resolve();
      });
    });
  });

  it('rejects lookup attempts for redirected webhook hostnames', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    const agent = await createSafeWebhookHttpsAgent(
      'https://hooks.example.com/webhook',
    );

    await new Promise<void>((resolve) => {
      agent.options.lookup?.('redirect.example.com', {}, (error) => {
        expect(error).toBeInstanceOf(Error);
        resolve();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// assertSafeWebhookHeaders
// ---------------------------------------------------------------------------

describe('assertSafeWebhookHeaders', () => {
  it('returns empty object for undefined input', () => {
    expect(assertSafeWebhookHeaders(undefined)).toEqual({});
  });

  it('returns the headers unchanged when all are safe', () => {
    const headers = {
      'X-Custom-Token': 'abc123',
      'X-Genfeed-Version': '1',
    };
    expect(assertSafeWebhookHeaders(headers)).toEqual(headers);
  });

  for (const blocked of BLOCKED_WEBHOOK_HEADERS) {
    it(`throws for blocked header '${blocked}'`, () => {
      expect(() => assertSafeWebhookHeaders({ [blocked]: 'value' })).toThrow(
        BadRequestException,
      );
    });

    it(`throws for blocked header '${blocked.toUpperCase()}' (case-insensitive)`, () => {
      expect(() =>
        assertSafeWebhookHeaders({ [blocked.toUpperCase()]: 'value' }),
      ).toThrow(BadRequestException);
    });
  }

  it('throws when a header name contains CR', () => {
    expect(() =>
      assertSafeWebhookHeaders({ 'X-Custom\rInject': 'value' }),
    ).toThrow(BadRequestException);
  });

  it('throws when a header name contains LF', () => {
    expect(() =>
      assertSafeWebhookHeaders({ 'X-Custom\nInject': 'value' }),
    ).toThrow(BadRequestException);
  });

  it('throws when a header value contains CRLF', () => {
    expect(() =>
      assertSafeWebhookHeaders({
        'X-Custom': 'value\r\nX-Injected: evil',
      }),
    ).toThrow(BadRequestException);
  });
});
