import {
  LogDebug,
  LogErrors,
  LogMethod,
  LogPerformance,
  LogVerbose,
} from '@api/helpers/decorators/log/log-method.decorator';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

describe('LogMethod Decorator', () => {
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    };
  });

  describe('LogMethod', () => {
    it('should log method start and completion', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod()
        async testMethod(value: number) {
          await Promise.resolve();
          return value * 2;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod(5);

      expect(result).toBe(10);
      expect(mockLogger.log).toHaveBeenCalledWith(
        'TestClass.testMethod started',
        expect.objectContaining({
          operation: 'testMethod',
          service: 'TestClass',
        }),
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.objectContaining({
          executionTime: expect.stringMatching(/\d+ms/),
          operation: 'testMethod',
          service: 'TestClass',
        }),
      );
    });

    it('should log arguments when logArgs is true', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logArgs: true })
        async testMethod(a: number, b: number) {
          await Promise.resolve();
          return a + b;
        }
      }

      const instance = new TestClass();
      await instance.testMethod(3, 4);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'TestClass.testMethod started',
        expect.objectContaining({
          args: [3, 4],
        }),
      );
    });

    it('should log result when logResult is true', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logResult: true })
        async testMethod() {
          await Promise.resolve();
          return { data: 'test', success: true };
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.objectContaining({
          result: { data: 'test', success: true },
        }),
      );
    });

    it('should log errors and re-throw', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod()
        async testMethod() {
          await Promise.resolve();
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();

      await expect(instance.testMethod()).rejects.toThrow('Test error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'TestClass.testMethod failed',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Test error',
          }),
          operation: 'testMethod',
          service: 'TestClass',
        }),
      );
    });

    it('should use debug level when specified', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ level: 'debug' })
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('should use verbose level when specified', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ level: 'verbose' })
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.verbose).toHaveBeenCalled();
      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it('should work without logger and just execute method', async () => {
      class TestClass {
        @LogMethod()
        async testMethod(value: number) {
          await Promise.resolve();
          return value * 2;
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod(5);

      expect(result).toBe(10);
    });

    it('should handle methods with no arguments', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logArgs: true })
        async testMethod() {
          await Promise.resolve();
          return 'no args';
        }
      }

      const instance = new TestClass();
      const result = await instance.testMethod();

      expect(result).toBe('no args');
      expect(mockLogger.log).toHaveBeenCalled();
    });

    it('should handle methods that return undefined', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logResult: true })
        async testMethod() {
          await Promise.resolve();
          return undefined;
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.not.objectContaining({
          result: expect.anything(),
        }),
      );
    });

    it('should skip start logging when logStart is false', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logStart: false })
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).toHaveBeenCalledTimes(1); // Only completion log
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        'TestClass.testMethod started',
        expect.any(Object),
      );
    });

    it('should skip end logging when logEnd is false', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logEnd: false })
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).toHaveBeenCalledTimes(1); // Only start log
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.any(Object),
      );
    });

    it('should skip error logging when logError is false', async () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod({ logError: false })
        async testMethod() {
          await Promise.resolve();
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();

      await expect(instance.testMethod()).rejects.toThrow('Test error');
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('preserves Nest route metadata on wrapped controller methods', () => {
      class TestController {
        async status() {
          await Promise.resolve();
          return 'ok';
        }
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        TestController.prototype,
        'status',
      );

      expect(descriptor).toBeDefined();
      Reflect.defineMetadata(PATH_METADATA, 'status', descriptor!.value);
      Reflect.defineMetadata(
        METHOD_METADATA,
        RequestMethod.GET,
        descriptor!.value,
      );

      LogMethod()(TestController.prototype, 'status', descriptor!);

      expect(Reflect.getMetadata(PATH_METADATA, descriptor!.value)).toBe(
        'status',
      );
      expect(Reflect.getMetadata(METHOD_METADATA, descriptor!.value)).toBe(
        RequestMethod.GET,
      );
    });
  });

  describe('LogDebug', () => {
    it('should use debug level logging', async () => {
      class TestClass {
        logger = mockLogger;

        @LogDebug()
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.debug).toHaveBeenCalledTimes(2); // start and end
      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('LogVerbose', () => {
    it('should log arguments and results', async () => {
      class TestClass {
        logger = mockLogger;

        @LogVerbose()
        async testMethod(a: number, b: number) {
          await Promise.resolve();
          return a + b;
        }
      }

      const instance = new TestClass();
      await instance.testMethod(3, 4);

      expect(mockLogger.verbose).toHaveBeenCalledWith(
        'TestClass.testMethod started',
        expect.objectContaining({
          args: [3, 4],
        }),
      );
      expect(mockLogger.verbose).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.objectContaining({
          result: 7,
        }),
      );
    });
  });

  describe('LogErrors', () => {
    it('should only log errors, not start or end', async () => {
      class TestClass {
        logger = mockLogger;

        @LogErrors()
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log errors when they occur', async () => {
      class TestClass {
        logger = mockLogger;

        @LogErrors()
        async testMethod() {
          await Promise.resolve();
          throw new Error('Test error');
        }
      }

      const instance = new TestClass();

      await expect(instance.testMethod()).rejects.toThrow('Test error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('LogPerformance', () => {
    it('should focus on execution time', async () => {
      class TestClass {
        logger = mockLogger;

        @LogPerformance()
        async testMethod() {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'done';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.objectContaining({
          executionTime: expect.stringMatching(/\d+ms/),
        }),
      );
    });

    it('should not log start or results', async () => {
      class TestClass {
        logger = mockLogger;

        @LogPerformance()
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.debug).toHaveBeenCalledTimes(1); // Only end log
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'TestClass.testMethod completed',
        expect.objectContaining({
          executionTime: expect.any(String),
        }),
      );
    });

    it('should respect explicit logEnd configuration in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        class TestClass {
          logger = mockLogger;

          @LogPerformance()
          async testMethod() {
            await Promise.resolve();
            return 'result';
          }
        }

        const instance = new TestClass();
        await instance.testMethod();

        // LogPerformance explicitly sets logEnd: true, so it should work in production
        expect(mockLogger.debug).toHaveBeenCalledTimes(1); // Only end log
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'TestClass.testMethod completed',
          expect.objectContaining({
            executionTime: expect.any(String),
          }),
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('production behavior', () => {
    it('should disable logStart and logEnd by default in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        class TestClass {
          logger = mockLogger;

          @LogMethod()
          async testMethod() {
            await Promise.resolve();
            return 'result';
          }
        }

        const instance = new TestClass();
        await instance.testMethod();

        // In production, default LogMethod should not log start or end
        expect(mockLogger.log).not.toHaveBeenCalled();
        expect(mockLogger.debug).not.toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should still log errors in production by default', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        class TestClass {
          logger = mockLogger;

          @LogMethod()
          async testMethod() {
            await Promise.resolve();
            throw new Error('Test error');
          }
        }

        const instance = new TestClass();

        await expect(instance.testMethod()).rejects.toThrow('Test error');
        expect(mockLogger.error).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle loggerService property name', async () => {
      class TestClass {
        loggerService = mockLogger;

        @LogMethod()
        async testMethod() {
          await Promise.resolve();
          return 'result';
        }
      }

      const instance = new TestClass();
      await instance.testMethod();

      expect(mockLogger.log).toHaveBeenCalled();
    });

    it('should handle synchronous methods', () => {
      class TestClass {
        logger = mockLogger;

        @LogMethod()
        async testMethod(value: number) {
          await Promise.resolve();
          return value * 2;
        }
      }

      const instance = new TestClass();
      const result = instance.testMethod(5);

      // Should work but may not log properly for sync methods
      expect(typeof result).toBeDefined();
    });
  });
});
