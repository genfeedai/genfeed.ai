import { describe, expect, it, vi } from 'vitest';
import {
  retryProviderRequest,
  settleProviderRequest,
} from './authorized-signals-request.util';

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
});
