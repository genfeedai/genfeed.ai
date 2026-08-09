import { CallerUtil } from '@libs/utils/caller/caller.util';

describe('CallerUtil', () => {
  describe('getCallerName', () => {
    it('returns a string', () => {
      const result = CallerUtil.getCallerName();
      expect(typeof result).toBe('string');
    });

    it('returns some name when called from test', () => {
      // When called from a test, should return something meaningful
      const result = CallerUtil.getCallerName();
      // In bun test, this might return 'anonymous' or the test runner's function name
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles skipFrames parameter', () => {
      // Should not throw with skip frames
      expect(() => CallerUtil.getCallerName(0)).not.toThrow();
      expect(() => CallerUtil.getCallerName(1)).not.toThrow();
      expect(() => CallerUtil.getCallerName(10)).not.toThrow();
    });

    it('returns unknown for excessive skipFrames', () => {
      // With a very high skip value, should return 'unknown'
      const result = CallerUtil.getCallerName(1000);
      expect(result).toBe('unknown');
    });

    it('returns a method name from a nested call', () => {
      function outerFunction() {
        return innerFunction();
      }

      function innerFunction() {
        return CallerUtil.getCallerName();
      }

      const result = outerFunction();
      // The result should contain something from the stack
      expect(typeof result).toBe('string');
    });

    it('returns a class method name from a class call', () => {
      class TestClass {
        testMethod() {
          return CallerUtil.getCallerName();
        }
      }

      const instance = new TestClass();
      const result = instance.testMethod();
      expect(typeof result).toBe('string');
    });
  });

  describe('getCallerName stack-format fallbacks', () => {
    const originalPrepareStackTrace = Error.prepareStackTrace;

    afterEach(() => {
      Error.prepareStackTrace = originalPrepareStackTrace;
    });

    const withStack = (stack: string | undefined): string => {
      Error.prepareStackTrace = () => stack;
      return CallerUtil.getCallerName();
    };

    it('returns unknown when no stack is available', () => {
      expect(withStack(undefined)).toBe('unknown');
    });

    it('returns unknown when the caller line is blank', () => {
      expect(withStack('Error\n    at getCallerName (util)\n   ')).toBe(
        'unknown',
      );
    });

    it('parses ClassName.methodName frames', () => {
      expect(
        withStack(
          'Error\n    at getCallerName (util)\n    at UsersController.findMe (controller)',
        ),
      ).toBe('findMe');
    });

    it('falls back to a dotted method name without a class', () => {
      expect(
        withStack(
          'Error\n    at getCallerName (util)\n    at .handler (webpack://bundle)',
        ),
      ).toBe('handler');
    });

    it('falls back to a bare function name before parentheses', () => {
      expect(
        withStack(
          'Error\n    at getCallerName (util)\n    at topLevelFn (native)',
        ),
      ).toBe('topLevelFn');
    });

    it('returns unknown when no pattern matches', () => {
      expect(
        withStack('Error\n    at getCallerName (util)\n    at <anonymous>'),
      ).toBe('unknown');
    });
  });
});
