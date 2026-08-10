import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canReceiveProviderWebhooks,
  isProviderWebhookReachable,
} from './provider-webhooks';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isProviderWebhookReachable', () => {
  it.each([
    [undefined, false],
    [null, false],
    ['', false],
    ['   ', false],
    ['not-a-url', false],
    ['http://localhost/hooks', false],
    ['https://127.0.0.1/hooks', false],
    ['https://api.genfeed.localhost', false],
    ['https://hooks.genfeed.localhost/v1', false],
    ['http://mybox.local/hooks', false],
    ['https://10.0.0.5/hooks', false],
    ['https://192.168.1.10/hooks', false],
    ['https://172.16.0.1/hooks', false],
    ['https://hooks.genfeed.ai', true],
    ['https://api.genfeed.ai/webhooks', true],
    ['http://tunnel.example.com', true],
  ] as const)('resolves %s as %s', (url, expected) => {
    expect(isProviderWebhookReachable(url)).toBe(expected);
  });
});

describe('canReceiveProviderWebhooks', () => {
  it('reads GENFEEDAI_WEBHOOKS_URL from the environment by default', () => {
    vi.stubEnv('GENFEEDAI_WEBHOOKS_URL', 'https://api.genfeed.localhost');
    expect(canReceiveProviderWebhooks()).toBe(false);

    vi.stubEnv('GENFEEDAI_WEBHOOKS_URL', 'https://hooks.genfeed.ai');
    expect(canReceiveProviderWebhooks()).toBe(true);
  });

  it('accepts an explicit base URL override', () => {
    expect(canReceiveProviderWebhooks('https://api.genfeed.localhost')).toBe(
      false,
    );
    expect(canReceiveProviderWebhooks('https://hooks.genfeed.ai')).toBe(true);
  });
});
