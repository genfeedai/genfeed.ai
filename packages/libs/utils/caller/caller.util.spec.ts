import { CallerUtil } from '@libs/utils/caller/caller.util';

describe('CallerUtil', () => {
  describe('getCallerName', () => {
    it('handles skipFrames parameter', () => {
      // Should not throw with skip frames
      expect(() => CallerUtil.getCallerName(0)).not.toThrow();
      expect(() => CallerUtil.getCallerName(1)).not.toThrow();
      expect(() => CallerUtil.getCallerName(10)).not.toThrow();
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

    it('returns unknown for Object.<anonymous> frames', () => {
      expect(
        withStack(
          'Error\n    at getCallerName (util)\n    at Object.<anonymous> (/app/dist/main.js:1:2)',
        ),
      ).toBe('unknown');
    });
  });
});
