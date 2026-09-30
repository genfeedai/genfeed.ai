import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RETRY_CONFIG } from '../types';
import {
  executionErrorFromHttpStatus,
  PermanentExecutionError,
  TransientExecutionError,
} from './execution-error';
import {
  calculateRetryDelay,
  createRetryHandler,
  isRetryableError,
  sleep,
  withRetry,
} from './retry-handler';

class NestLikeHttpError extends Error {
  constructor(
    private readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'NestLikeHttpError';
  }

  getStatus(): number {
    return this.statusCode;
  }
}

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
  it('retries TransientExecutionError', () => {
    expect(
      isRetryableError(new TransientExecutionError('provider timeout')),
    ).toBe(true);
  });
  it('does not retry PermanentExecutionError', () => {
    expect(
      isRetryableError(new PermanentExecutionError('invalid payload')),
    ).toBe(false);
  });
  it('does not retry unknown errors', () => {
    expect(isRetryableError(new Error('something random'))).toBe(false);
  });
  it('does not retry non-Error values', () => {
    expect(isRetryableError('some string')).toBe(false);
  });
  it('retries Nest-like 429 via getStatus()', () => {
    expect(isRetryableError(new NestLikeHttpError(429, 'rate limited'))).toBe(
      true,
    );
  });
  it('does not retry Nest-like 400 via getStatus()', () => {
    expect(isRetryableError(new NestLikeHttpError(400, 'bad request'))).toBe(
      false,
    );
  });
  it('maps executor HTTP status into the typed contract', () => {
    expect(executionErrorFromHttpStatus(503, 'unavailable').isRetryable).toBe(
      true,
    );
    expect(executionErrorFromHttpStatus(404, 'missing').isRetryable).toBe(
      false,
    );
    expect(
      isRetryableError(executionErrorFromHttpStatus(502, 'bad gateway')),
    ).toBe(true);
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
      .mockRejectedValueOnce(new TransientExecutionError('provider timeout'))
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
    const fn = vi
      .fn()
      .mockRejectedValue(new PermanentExecutionError('unauthorized'));
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
    const fn = vi
      .fn()
      .mockRejectedValue(new TransientExecutionError('provider timeout'));
    await expect(
      withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        baseDelayMs: 1,
        maxRetries: 1,
      }),
    ).rejects.toThrow('provider timeout');
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
