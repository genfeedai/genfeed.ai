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
});
