import type { LookupFunction } from 'node:net';
import { afterEach, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

import {
  assertSafeWebhookEndpoint,
  createPinnedWebhookAgent,
  WebhookEndpointValidationError,
} from '@api/services/webhook-client/webhook-endpoint.validator';

interface InspectablePinnedAgent {
  options: {
    lookup?: LookupFunction;
    servername?: string;
  };
}

function inspectPinnedAgent(
  agent: ReturnType<typeof createPinnedWebhookAgent>,
): InspectablePinnedAgent {
  return agent as unknown as InspectablePinnedAgent;
}

describe('assertSafeWebhookEndpoint', () => {
  afterEach(() => {
    dnsLookupMock.mockReset();
  });

  it.each([
    'http://localhost/webhook',
    'http://127.0.0.1/webhook',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1/webhook',
    'http://192.168.1.10/webhook',
  ])('rejects unsafe endpoint %s', async (endpoint) => {
    await expect(assertSafeWebhookEndpoint(endpoint)).rejects.toThrow();
  });

  it('rejects non-http schemes', async () => {
    const validation = assertSafeWebhookEndpoint('file:///etc/passwd');
    await expect(validation).rejects.toBeInstanceOf(
      WebhookEndpointValidationError,
    );
    await expect(validation).rejects.toThrow(
      'Webhook endpoint must use http or https',
    );
  });

  it('allows public IP endpoints', async () => {
    await expect(
      assertSafeWebhookEndpoint('https://8.8.8.8/webhook'),
    ).resolves.toMatchObject({
      addresses: [{ address: '8.8.8.8', family: 4 }],
      hostname: '8.8.8.8',
    });
  });

  it('retains every validated DNS address in verbatim order', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);

    await expect(
      assertSafeWebhookEndpoint('https://hooks.example.com/webhook'),
    ).resolves.toMatchObject({
      addresses: [
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ],
      hostname: 'hooks.example.com',
    });
  });

  it('normalizes and retains a public IPv6 literal', async () => {
    await expect(
      assertSafeWebhookEndpoint('https://[2606:4700:4700::1111]/webhook'),
    ).resolves.toMatchObject({
      addresses: [{ address: '2606:4700:4700::1111', family: 6 }],
      hostname: '2606:4700:4700::1111',
    });
    expect(dnsLookupMock).not.toHaveBeenCalled();
  });

  it('fails closed when DNS returns no validated addresses', async () => {
    dnsLookupMock.mockResolvedValueOnce([]);

    await expect(
      assertSafeWebhookEndpoint('https://hooks.example.com/webhook'),
    ).rejects.toThrow('private or reserved');
  });

  it('rejects the entire DNS set when any answer is private or reserved', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.7', family: 4 },
    ]);

    await expect(
      assertSafeWebhookEndpoint('https://hooks.example.com/webhook'),
    ).rejects.toThrow('private or reserved');
  });

  it('fails closed when DNS reports an inconsistent address family', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 6 },
    ]);

    await expect(
      assertSafeWebhookEndpoint('https://hooks.example.com/webhook'),
    ).rejects.toThrow('unsupported address family');
  });

  it('pins HTTPS lookup and SNI to the validated hostname and address set', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    const endpoint = await assertSafeWebhookEndpoint(
      'https://hooks.example.com/webhook',
    );
    const agent = inspectPinnedAgent(createPinnedWebhookAgent(endpoint));
    const pinnedLookup = agent.options.lookup;

    expect(agent.options.servername).toBe('hooks.example.com');
    expect(pinnedLookup).toBeTypeOf('function');

    await new Promise<void>((resolve, reject) => {
      pinnedLookup?.('hooks.example.com', { all: true }, (error, addresses) => {
        if (error) {
          reject(error);
          return;
        }

        expect(addresses).toEqual([
          { address: '93.184.216.34', family: 4 },
          { address: '2606:4700:4700::1111', family: 6 },
        ]);
        resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      pinnedLookup?.(
        'hooks.example.com',
        { family: 6 },
        (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }

          expect(address).toBe('2606:4700:4700::1111');
          expect(family).toBe(6);
          resolve();
        },
      );
    });

    await new Promise<void>((resolve, reject) => {
      pinnedLookup?.(
        'hooks.example.com',
        { family: 'IPv4' },
        (error, address, family) => {
          if (error) {
            reject(error);
            return;
          }

          expect(address).toBe('93.184.216.34');
          expect(family).toBe(4);
          resolve();
        },
      );
    });
  });

  it('rejects an unexpected hostname without falling back to DNS', async () => {
    dnsLookupMock.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
    ]);
    const endpoint = await assertSafeWebhookEndpoint(
      'http://hooks.example.com/webhook',
    );
    const agent = inspectPinnedAgent(createPinnedWebhookAgent(endpoint));

    await new Promise<void>((resolve) => {
      agent.options.lookup?.(
        'rebound.internal',
        {},
        (error, _address, _family) => {
          expect(error).toBeInstanceOf(WebhookEndpointValidationError);
          resolve();
        },
      );
    });
    expect(dnsLookupMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty validated set at agent creation', () => {
    expect(() =>
      createPinnedWebhookAgent({
        addresses: [],
        hostname: 'hooks.example.com',
        url: new URL('https://hooks.example.com/webhook'),
      }),
    ).toThrow('no validated public addresses');
  });

  it('preserves transient DNS failures as retryable system errors', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo EAI_AGAIN'), {
      code: 'EAI_AGAIN',
    });
    dnsLookupMock.mockRejectedValueOnce(dnsError);

    await expect(
      assertSafeWebhookEndpoint('https://hooks.example.com/webhook'),
    ).rejects.toBe(dnsError);
  });
});
