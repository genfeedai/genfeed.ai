import { PollTimeoutException } from '@api/shared/services/poll-until/poll-until.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PollOptions {
  /** Interval between poll attempts in milliseconds. Default: 2000 */
  intervalMs?: number;
  /** Maximum total wait time in milliseconds. Default: 120_000 (2 minutes) */
  timeoutMs?: number;
  /** Backoff multiplier applied to intervalMs after each attempt. Default: 1 (no backoff) */
  backoff?: number;
  /** Maximum interval when backoff is applied, in milliseconds. Default: 30_000 */
  maxIntervalMs?: number;
}

export interface PollResult<T> {
  value: T;
  attempts: number;
  elapsedMs: number;
}

/**
 * Generic polling utility. Replaces duplicated while-loop patterns across
 * Replicate, HeyGen, LLM health checks, Higgsfield, and Apify.
 *
 * Usage:
 * ```typescript
 * const result = await this.pollUntilService.poll(
 *   () => this.fetchStatus(id),
 *   (status) => status === 'completed' || status === 'failed',
 *   { intervalMs: 5_000, timeoutMs: 600_000 },
 * );
 * ```
 */
@Injectable()
export class PollUntilService {
  private readonly logContext = 'PollUntilService';

  constructor(private readonly logger: LoggerService) {}

  /**
   * Polls a function until a predicate returns true, or until timeout.
   *
   * @param fn         - Async function to call on each poll attempt
   * @param isDone     - Predicate: return true when polling should stop
   * @param options    - Poll configuration (intervalMs, timeoutMs, backoff)
   * @returns          - Resolved value from fn when isDone returns true
   * @throws           - PollTimeoutException if timeout is reached
   * @throws           - Any error thrown by fn (not caught here — callers handle their own errors)
   */
  async poll<T>(
    fn: () => Promise<T>,
    isDone: (value: T) => boolean,
    options?: PollOptions,
  ): Promise<PollResult<T>> {
    const {
      intervalMs = 2_000,
      timeoutMs = 120_000,
      backoff = 1,
      maxIntervalMs = 30_000,
    } = options ?? {};

    const startTime = Date.now();
    const deadline = startTime + timeoutMs;
    let attempts = 0;
    let currentInterval = intervalMs;

    while (Date.now() < deadline) {
      attempts++;
      const value = await fn();

      if (isDone(value)) {
        const elapsedMs = Date.now() - startTime;
        this.logger.log(
          `Poll resolved after ${attempts} attempt(s) in ${elapsedMs}ms`,
          {
            attempts,
            elapsedMs,
          },
        );
        return { attempts, elapsedMs, value };
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }

      const waitMs = Math.min(currentInterval, remainingMs);
      await this.sleep(waitMs);

      if (backoff > 1) {
        currentInterval = Math.min(currentInterval * backoff, maxIntervalMs);
      }
    }

    const elapsedMs = Date.now() - startTime;
    this.logger.warn(
      `Poll timed out after ${attempts} attempt(s) in ${elapsedMs}ms`,
      {
        attempts,
        elapsedMs,
        timeoutMs,
      },
    );
    throw new PollTimeoutException(
      `Poll timed out after ${elapsedMs}ms (${attempts} attempts, limit ${timeoutMs}ms)`,
      timeoutMs,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
