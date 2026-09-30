import {
  HandleErrors,
  HandleErrorsSync,
} from '@api/helpers/decorators/error-handler.decorator';
import { describe, expect, it, vi } from 'vitest';

describe('HandleErrors', () => {
  it('returns the resolved value', async () => {
    class Example {
      @HandleErrors('load', 'widgets')
      async load() {
        return 7;
      }
    }

    await expect(new Example().load()).resolves.toBe(7);
  });

  it('logs and rethrows when a logger is present', async () => {
    const logger = { error: vi.fn() };

    class Example {
      logger = logger;

      @HandleErrors('save')
      async save() {
        throw new Error('disk full');
      }
    }

    await expect(new Example().save()).rejects.toThrow('disk full');
    expect(logger.error).toHaveBeenCalledWith(
      'Example.save failed',
      expect.objectContaining({
        args: 'none',
        context: 'save',
        error: 'disk full',
        operation: 'save',
      }),
    );
  });
});

describe('HandleErrorsSync', () => {
  it('returns the value and rethrows without a logger', () => {
    class Example {
      @HandleErrorsSync('compute', 'math')
      compute(value: number) {
        return value * 2;
      }

      @HandleErrorsSync('boom')
      boom() {
        throw new Error('nope');
      }
    }

    expect(new Example().compute(3)).toBe(6);
    expect(() => new Example().boom()).toThrow('nope');
  });

  it('logs synchronous failures', () => {
    const logger = { error: vi.fn() };

    class Example {
      logger = logger;

      @HandleErrorsSync('parse', 'input')
      parse() {
        throw new Error('bad json');
      }
    }

    expect(() => new Example().parse()).toThrow('bad json');
    expect(logger.error).toHaveBeenCalledWith(
      'Example.parse failed',
      expect.objectContaining({
        context: 'input',
        error: 'bad json',
        operation: 'parse',
      }),
    );
  });
});
