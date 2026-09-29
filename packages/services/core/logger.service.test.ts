import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so these refs are available when vi.mock factories are hoisted to the top
const {
  mockCaptureException,
  mockCaptureMessage,
  mockGetClient,
  mockPinoDebug,
  mockPinoError,
  mockPinoInfo,
  mockPinoWarn,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
  // A started SDK by default; the held-report tests below clear it.
  mockGetClient: vi.fn<() => object | undefined>(() => ({})),
  mockPinoDebug: vi.fn(),
  mockPinoError: vi.fn(),
  mockPinoInfo: vi.fn(),
  mockPinoWarn: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
  getClient: mockGetClient,
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    debug: mockPinoDebug,
    error: mockPinoError,
    info: mockPinoInfo,
    warn: mockPinoWarn,
  })),
}));

// Import after mocks
import { logger } from '@services/core/logger.service';
import { takeHeldSentryReports } from '@services/core/sentry-held-reports';

describe('logger.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('debug', () => {
    it('should log message without object', () => {
      logger.debug('Debug message');

      expect(mockPinoDebug).toHaveBeenCalledWith('Debug message');
    });

    it('should log message with object', () => {
      const obj = { key: 'value' };
      logger.debug('Debug with data', obj);

      expect(mockPinoDebug).toHaveBeenCalledWith(obj, 'Debug with data');
    });
  });

  describe('info', () => {
    it('should log message without object', () => {
      logger.info('Info message');

      expect(mockPinoInfo).toHaveBeenCalledWith('Info message');
    });

    it('should log message with object', () => {
      const obj = { count: 5 };
      logger.info('Info with count', obj);

      expect(mockPinoInfo).toHaveBeenCalledWith(obj, 'Info with count');
    });
  });

  describe('warn', () => {
    it('should log message without object', () => {
      logger.warn('Warning message');

      expect(mockPinoWarn).toHaveBeenCalledWith('Warning message');
    });

    it('should log message with object', () => {
      const obj = { warning: 'low memory' };
      logger.warn('Memory warning', obj);

      expect(mockPinoWarn).toHaveBeenCalledWith(obj, 'Memory warning');
    });

    it('should send warning to Sentry', () => {
      logger.warn('Warning for Sentry');

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Warning for Sentry',
        expect.objectContaining({
          level: 'warning',
        }),
      );
    });

    it('should include extra data in Sentry', () => {
      const obj = { context: 'test' };
      logger.warn('Warning with context', obj);

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Warning with context',
        expect.objectContaining({
          extra: obj,
          level: 'warning',
        }),
      );
    });

    it('should include tags in Sentry if provided', () => {
      const obj = { tags: { service: 'api' } };
      logger.warn('Tagged warning', obj);

      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'Tagged warning',
        expect.objectContaining({
          tags: { service: 'api' },
        }),
      );
    });
  });

  describe('error', () => {
    it('should log message without object', () => {
      logger.error('Error message');

      expect(mockPinoError).toHaveBeenCalledWith('Error message');
    });

    it('should log message with object', () => {
      const obj = { errorCode: 500 };
      logger.error('Server error', obj);

      expect(mockPinoError).toHaveBeenCalledWith(obj, 'Server error');
    });

    it('should extract Error object for Sentry', () => {
      const error = new Error('Original error');
      logger.error('Wrapped error', { error });

      expect(mockCaptureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          level: 'error',
        }),
      );
    });

    it('should skip Sentry for handled network errors', () => {
      const error = Object.assign(
        new Error('Network error. Please check your connection and try again.'),
        { isNetworkError: true },
      );

      logger.error('Handled network error', { error });

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should include tags in Sentry if provided with a real Error', () => {
      const obj = {
        error: new Error('Tagged error'),
        tags: { component: 'auth' },
      };
      logger.error('Tagged error', obj);

      expect(mockCaptureException).toHaveBeenCalledWith(
        obj.error,
        expect.objectContaining({
          tags: { component: 'auth' },
        }),
      );
    });
  });

  describe('Sentry error handling', () => {
    it('should fail silently if Sentry throws on captureException', () => {
      mockCaptureException.mockImplementationOnce(() => {
        throw new Error('Sentry unavailable');
      });

      // Should not throw
      expect(() =>
        logger.error('Test error', { error: new Error('Boom') }),
      ).not.toThrow();
    });

    it('should fail silently if Sentry throws on captureMessage', () => {
      mockCaptureMessage.mockImplementationOnce(() => {
        throw new Error('Sentry unavailable');
      });

      // Should not throw
      expect(() => logger.warn('Test warning')).not.toThrow();
    });

    it('should log debug if Sentry fails', () => {
      mockCaptureException.mockImplementationOnce(() => {
        throw new Error('Sentry error');
      });

      logger.error('Test', { error: new Error('Boom') });

      expect(mockPinoDebug).toHaveBeenCalledWith(
        expect.objectContaining({ sentryError: expect.any(Error) }),
        'Failed to send error to Sentry',
      );
    });
  });

  describe('object handling', () => {
    it('should handle undefined object for debug', () => {
      logger.debug('Message only');

      expect(mockPinoDebug).toHaveBeenCalledWith('Message only');
    });

    it('should handle undefined object for info', () => {
      logger.info('Message only');

      expect(mockPinoInfo).toHaveBeenCalledWith('Message only');
    });

    it('should handle undefined object for warn', () => {
      logger.warn('Message only');

      expect(mockPinoWarn).toHaveBeenCalledWith('Message only');
    });

    it('should handle undefined object for error', () => {
      logger.error('Message only');

      expect(mockPinoError).toHaveBeenCalledWith('Message only');
    });

    it('should handle complex nested objects', () => {
      const complexObj = {
        items: [1, 2, 3],
        nested: { deep: { value: true } },
        user: { id: '123', name: 'Test' },
      };

      logger.info('Complex data', complexObj);

      expect(mockPinoInfo).toHaveBeenCalledWith(complexObj, 'Complex data');
    });
  });

  describe('browser console formatting', () => {
    it('logs a concise error summary and moves context to debug', () => {
      const consoleError = vi.fn();
      const consoleDebug = vi.fn();
      vi.stubGlobal('window', {});
      vi.spyOn(console, 'error').mockImplementation(consoleError);
      vi.spyOn(console, 'debug').mockImplementation(consoleDebug);

      const error = new TypeError('Illegal invocation');
      error.stack =
        'TypeError: Illegal invocation\n    at WorkspacePageContentContent (workspace-page.tsx:1440:32)';

      logger.error('ErrorBoundary caught an error', {
        componentStack:
          '\n    at WorkspacePageContentContent\n    at Suspense\n    at WorkspacePageContent',
        error,
        retryCount: 0,
        tags: { errorBoundary: 'true' },
        url: 'http://genfeed.localhost/default/default/workspace/overview',
      });

      expect(consoleError).toHaveBeenCalledWith(
        'ErrorBoundary caught an error\nTypeError: Illegal invocation\nat WorkspacePageContentContent (workspace-page.tsx:1440:32)',
      );
      expect(consoleDebug).toHaveBeenCalledWith(
        'ErrorBoundary caught an error context',
        expect.objectContaining({
          componentStack: [
            'at WorkspacePageContentContent',
            'at Suspense',
            'at WorkspacePageContent',
          ],
          retryCount: 0,
          tags: { errorBoundary: 'true' },
          url: 'http://genfeed.localhost/default/default/workspace/overview',
        }),
      );
    });
  });

  // The website starts Sentry once the page is idle; a boundary can catch a
  // render error before that. Those reports are held, not dropped.
  describe('before Sentry has started in the browser', () => {
    beforeEach(() => {
      vi.stubGlobal('window', {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGetClient.mockReturnValueOnce(undefined);
      takeHeldSentryReports();
    });

    it('holds an error report for the deferred start to replay', () => {
      const error = new Error('Render failed');

      logger.error('ErrorBoundary caught an error', {
        error,
        tags: { errorBoundary: 'true' },
      });

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(takeHeldSentryReports()).toEqual([
        {
          context: expect.objectContaining({
            level: 'error',
            tags: { errorBoundary: 'true' },
          }),
          error,
          kind: 'exception',
        },
      ]);
    });

    it('holds a warning report the same way', () => {
      logger.warn('Slow boot', { tags: { area: 'boot' } });

      expect(mockCaptureMessage).not.toHaveBeenCalled();
      expect(takeHeldSentryReports()).toEqual([
        {
          context: expect.objectContaining({
            level: 'warning',
            tags: { area: 'boot' },
          }),
          kind: 'message',
          message: 'Slow boot',
        },
      ]);
    });

    it('sends straight to Sentry once it has a client', () => {
      mockGetClient.mockReset();
      mockGetClient.mockReturnValue({});
      const error = new Error('Later failure');

      logger.error('Failed', error);

      expect(mockCaptureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ level: 'error' }),
      );
      expect(takeHeldSentryReports()).toEqual([]);
    });
  });
});
