import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  retryProviderRequest,
  settleProviderRequest,
} from './authorized-signals-request.util';

const authorizedSignalsSources = [
  [
    'Instagram provider',
    '../instagram/services/instagram-authorized-signals.provider.ts',
  ],
  [
    'Instagram service',
    '../instagram/services/instagram-authorized-signals.service.ts',
  ],
  [
    'LinkedIn service',
    '../linkedin/services/linkedin-authorized-signals.service.ts',
  ],
  [
    'TikTok provider',
    '../tiktok/services/tiktok-authorized-signals.provider.ts',
  ],
  ['TikTok service', '../tiktok/services/tiktok-authorized-signals.service.ts'],
] as const;

describe('authorized signals request utilities', () => {
  it('retries retryable failures using the provider delay policy', async () => {
    const request = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryProviderRequest(request, {
        getDelayMs: (_error, attempt) => 100 * 2 ** attempt,
        isRetryable: () => true,
        maxAttempts: 3,
        sleep,
      }),
    ).resolves.toBe('ok');

    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('does not retry non-retryable failures', async () => {
    const error = new Error('unauthorized');
    const request = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryProviderRequest(request, {
        getDelayMs: () => 100,
        isRetryable: () => false,
        maxAttempts: 3,
        sleep,
      }),
    ).rejects.toBe(error);

    expect(request).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it('settles optional, successful, and failed requests', async () => {
    const error = new Error('provider failed');

    await expect(settleProviderRequest(undefined)).resolves.toEqual({});
    await expect(settleProviderRequest(Promise.resolve('ok'))).resolves.toEqual(
      { value: 'ok' },
    );
    await expect(settleProviderRequest(Promise.reject(error))).resolves.toEqual(
      { error },
    );
  });

  it.each(authorizedSignalsSources)(
    '%s uses the shared settled-result contract directly',
    (_label, path) => {
      const source = readFileSync(
        fileURLToPath(new URL(path, import.meta.url)),
        'utf8',
      );

      expect(source).toContain('AuthorizedSignalsSettledResult');
      expect(source).not.toMatch(/\bSettledResult\b/);
    },
  );
});
