import {
  BrokenCircuitError,
  createProcessorCircuitBreaker,
  ProcessorCircuitBreaker,
} from '@api/shared/utils/circuit-breaker/circuit-breaker.util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    })),
  },
}));

describe('BrokenCircuitError', () => {
  it('creates error with processor name and failure count', () => {
    const err = new BrokenCircuitError('test-processor', 5);
    expect(err.processorName).toBe('test-processor');
    expect(err.consecutiveFailures).toBe(5);
    expect(err.message).toContain('test-processor');
    expect(err.message).toContain('5');
    expect(err.name).toBe('BrokenCircuitError');
  });

  it('is an instance of Error', () => {
    const err = new BrokenCircuitError('processor', 3);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ProcessorCircuitBreaker', () => {
  let breaker: ProcessorCircuitBreaker;

  beforeEach(() => {
    breaker = new ProcessorCircuitBreaker('test-processor', undefined, {
      resetTimeoutMs: 1000,
      threshold: 3,
    });
  });

  it('starts in closed state', () => {
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });

  it('executes function successfully in closed state', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const result = await breaker.execute(fn);
    expect(result).toBe('result');
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });

  it('opens circuit after threshold failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        // Expected
      }
    }
    expect(breaker.getState()).toBe('open');
  });

  it('throws BrokenCircuitError when circuit is open', async () => {
    // Open the circuit by failing threshold times
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        // Expected failures
      }
    }

    // Next call should throw BrokenCircuitError immediately
    await expect(breaker.execute(vi.fn())).rejects.toThrow(BrokenCircuitError);
  });

  it('resets state when reset() is called', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(fn);
      } catch {
        // Expected
      }
    }
    expect(breaker.getState()).toBe('open');
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getConsecutiveFailures()).toBe(0);
  });

  it('records consecutive failures correctly', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    try {
      await breaker.execute(fn);
    } catch {
      // Expected
    }
    expect(breaker.getConsecutiveFailures()).toBe(1);
  });
});

describe('createProcessorCircuitBreaker', () => {
  it('creates a ProcessorCircuitBreaker instance', () => {
    const breaker = createProcessorCircuitBreaker('test');
    expect(breaker).toBeInstanceOf(ProcessorCircuitBreaker);
  });

  it('creates breaker with custom options', () => {
    const breaker = createProcessorCircuitBreaker('test', undefined, {
      threshold: 10,
    });
    expect(breaker).toBeInstanceOf(ProcessorCircuitBreaker);
  });
});
