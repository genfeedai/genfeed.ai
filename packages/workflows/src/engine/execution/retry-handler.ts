import type { RetryConfig } from '../types';
import { DEFAULT_RETRY_CONFIG } from '../types';
import { isTypedRetryableError } from './execution-error';

export function calculateRetryDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const delay = config.baseDelayMs * config.backoffMultiplier ** attemptNumber;
  const jitter = delay * 0.1 * Math.random();
  return Math.min(delay + jitter, config.maxDelayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown): boolean {
  return isTypedRetryableError(error);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attemptNumber: number, error: Error, delayMs: number) => void,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= config.maxRetries || !isRetryableError(error)) {
        throw lastError;
      }

      const delay = calculateRetryDelay(attempt, config);

      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry failed with unknown error');
}

export function createRetryHandler(config: Partial<RetryConfig> = {}): {
  withRetry: <T>(
    fn: () => Promise<T>,
    onRetry?: (attemptNumber: number, error: Error, delayMs: number) => void,
  ) => Promise<T>;
  config: RetryConfig;
} {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };

  return {
    config: finalConfig,
    withRetry: <T>(
      fn: () => Promise<T>,
      onRetry?: (attemptNumber: number, error: Error, delayMs: number) => void,
    ) => withRetry(fn, finalConfig, onRetry),
  };
}
