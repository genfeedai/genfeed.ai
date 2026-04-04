import { LoggerService } from '@libs/logger/logger.service';

/**
 * Error thrown when the circuit breaker is open (too many consecutive failures).
 * Processors should catch this to fail jobs immediately without retry.
 */
export class BrokenCircuitError extends Error {
  constructor(
    public readonly processorName: string,
    public readonly consecutiveFailures: number,
  ) {
    super(
      `Circuit breaker open for "${processorName}" after ${consecutiveFailures} consecutive failures`,
    );
    this.name = 'BrokenCircuitError';
  }
}

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit (default: 5) */
  threshold: number;
  /** Time in ms before transitioning from open → half-open (default: 30000) */
  resetTimeoutMs: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  resetTimeoutMs: 30_000,
  threshold: 5,
};

/**
 * Zero-dependency circuit breaker for BullMQ queue processors.
 *
 * States:
 * - **closed**: Normal operation. Failures increment the counter.
 * - **open**: All calls immediately throw `BrokenCircuitError`.
 *   After `resetTimeoutMs`, transitions to half-open.
 * - **half-open**: Next call is a probe. Success → closed. Failure → open.
 *
 * @example
 * const cb = createProcessorCircuitBreaker('analytics-twitter', logger);
 *
 * async process(job) {
 *   return cb.execute(async () => {
 *     // existing process logic
 *   });
 * }
 */
export class ProcessorCircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(
    private readonly name: string,
    private readonly logger?: LoggerService,
    options?: Partial<CircuitBreakerOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = 'half-open';
        this.logger?.log(
          `Circuit breaker "${this.name}" transitioning to half-open`,
        );
      } else {
        throw new BrokenCircuitError(this.name, this.consecutiveFailures);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  reset(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.logger?.log(
        `Circuit breaker "${this.name}" closed after probe success`,
      );
    }
    this.state = 'closed';
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.options.threshold
    ) {
      this.state = 'open';
      this.logger?.warn(
        `Circuit breaker "${this.name}" opened after ${this.consecutiveFailures} consecutive failures`,
      );
    }
  }
}

/**
 * Factory function — mirrors the project's `createProcessorErrorHandler` pattern.
 */
export function createProcessorCircuitBreaker(
  name: string,
  logger?: LoggerService,
  options?: Partial<CircuitBreakerOptions>,
): ProcessorCircuitBreaker {
  return new ProcessorCircuitBreaker(name, logger, options);
}
