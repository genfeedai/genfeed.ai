import { assertSafeWebhookEndpoint } from '@api/services/webhook-client/webhook-endpoint.validator';

describe('assertSafeWebhookEndpoint', () => {
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
    await expect(
      assertSafeWebhookEndpoint('file:///etc/passwd'),
    ).rejects.toThrow('Webhook endpoint must use http or https');
  });

  it('allows public IP endpoints', async () => {
    await expect(
      assertSafeWebhookEndpoint('https://8.8.8.8/webhook'),
    ).resolves.toBeUndefined();
  });
});
