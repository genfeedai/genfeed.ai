import { afterEach, vi } from 'vitest';

const dnsLookupMock = vi.hoisted(() => vi.fn());

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

import {
  assertSafeWebhookEndpoint,
  WebhookEndpointValidationError,
} from '@api/services/webhook-client/webhook-endpoint.validator';

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
    ).resolves.toBeUndefined();
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
