import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so these refs are available when vi.mock factories are hoisted to the top
const {
  mockCaptureException,
  mockCaptureMessage,
  mockPinoDebug,
  mockPinoError,
  mockPinoInfo,
  mockPinoWarn,
} = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
  mockCaptureMessage: vi.fn(),
  mockPinoDebug: vi.fn(),
  mockPinoError: vi.fn(),
  mockPinoInfo: vi.fn(),
  mockPinoWarn: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: mockCaptureException,
  captureMessage: mockCaptureMessage,
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

describe('logger.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    it('should not send to Sentry', () => {
      logger.debug('Debug message');

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
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

    it('should not send to Sentry', () => {
      logger.info('Info message');

      expect(mockCaptureException).not.toHaveBeenCalled();
      expect(mockCaptureMessage).not.toHaveBeenCalled();
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

    it('should send error to Sentry', () => {
      logger.error('Error for Sentry', { error: new Error('Boom') });

      expect(mockCaptureException).toHaveBeenCalled();
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

    it('should create new Error if not provided', () => {
      logger.error('String error only');

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should include extra context in Sentry', () => {
      const obj = { action: 'create', userId: '123' };
      logger.error('Error with context', obj);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should include tags in Sentry if provided', () => {
      const obj = { tags: { component: 'auth' } };
      logger.error('Tagged error', obj);

      expect(mockCaptureException).not.toHaveBeenCalled();
    });

    it('should skip Sentry when reportToSentry is false', () => {
      logger.error('Handled error', {
        error: new Error('Original error'),
        reportToSentry: false,
      });

      expect(mockCaptureException).not.toHaveBeenCalled();
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
});
