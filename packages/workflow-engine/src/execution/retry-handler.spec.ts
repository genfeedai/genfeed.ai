import {
  calculateRetryDelay,
  createRetryHandler,
  isRetryableError,
  sleep,
  withRetry,
} from '@workflow-engine/execution/retry-handler';
import { DEFAULT_RETRY_CONFIG } from '@workflow-engine/types';
import { describe, expect, it, vi } from 'vitest';

describe('calculateRetryDelay', () => {
  it('increases delay with attempt number', () => {
    const d0 = calculateRetryDelay(0);
    const d1 = calculateRetryDelay(1);
    expect(d1).toBeGreaterThan(d0);
  });

  it('respects maxDelayMs', () => {
    const delay = calculateRetryDelay(100, {
      ...DEFAULT_RETRY_CONFIG,
      maxDelayMs: 5000,
    });
    expect(delay).toBeLessThanOrEqual(5000);
  });
});

describe('sleep', () => {
  it('resolves after delay', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe('isRetryableError', () => {
  it('retries network errors', () => {
    expect(isRetryableError(new Error('network timeout'))).toBe(true);
  });
  it('retries rate limit (429)', () => {
    expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
  });
  it('does not retry validation errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
  });
  it('does not retry unauthorized', () => {
    expect(isRetryableError(new Error('unauthorized'))).toBe(false);
  });
  it('retries non-Error values', () => {
    expect(isRetryableError('some string')).toBe(true);
  });
  it('retries unknown errors', () => {
    expect(isRetryableError(new Error('something random'))).toBe(true);
  });
});

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('ok');
    const onRetry = vi.fn();
    const result = await withRetry(
      fn,
      { ...DEFAULT_RETRY_CONFIG, baseDelayMs: 1, maxRetries: 2 },
      onRetry,
    );
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('throws on non-retryable error immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('unauthorized'));
    await expect(
      withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        baseDelayMs: 1,
        maxRetries: 3,
      }),
    ).rejects.toThrow('unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network error'));
    await expect(
      withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        baseDelayMs: 1,
        maxRetries: 1,
      }),
    ).rejects.toThrow('network error');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wraps non-Error into Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    await expect(
      withRetry(fn, { ...DEFAULT_RETRY_CONFIG, maxRetries: 0 }),
    ).rejects.toThrow('string error');
  });
});

describe('createRetryHandler', () => {
  it('creates handler with merged config', () => {
    const handler = createRetryHandler({ maxRetries: 5 });
    expect(handler.config.maxRetries).toBe(5);
    expect(handler.config.baseDelayMs).toBe(DEFAULT_RETRY_CONFIG.baseDelayMs);
  });

  it('withRetry function works', async () => {
    const handler = createRetryHandler({ maxRetries: 0 });
    const result = await handler.withRetry(async () => 'ok');
    expect(result).toBe('ok');
  });
});
