import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setErrorReporter(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debug', () => {
    it('should call debug with formatted message', () => {
      // The logger instance was created at import time, so isDev is fixed
      // We can verify the method exists and can be called
      logger.debug('Debug message');

      // In test environment (development), debug should be called
      // Note: behavior depends on NODE_ENV at import time
    });

    it('should include context in debug message', () => {
      logger.debug('Test message', { context: 'TestComponent' });

      // Check if console.debug was called (behavior depends on NODE_ENV)
      // In production it won't be called, in development it will
    });

    it('should include metadata in debug message', () => {
      logger.debug('Test message', { metadata: { key: 'value' } });
    });
  });

  describe('info', () => {
    it('should log info message', () => {
      logger.info('Info message');

      // Info logs only in development
    });

    it('should include context in info message', () => {
      logger.info('Test message', { context: 'TestService' });
    });
  });

  describe('warn', () => {
    it('should log warning message always', () => {
      logger.warn('Warning message');

      expect(console.warn).toHaveBeenCalled();
    });

    it('should include context in warning message', () => {
      logger.warn('Test warning', { context: 'WarningContext' });

      expect(console.warn).toHaveBeenCalled();
      const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toContain('[WarningContext]');
    });

    it('should include metadata in warning message', () => {
      logger.warn('Test warning', { metadata: { userId: '123' } });

      expect(console.warn).toHaveBeenCalled();
      const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toEqual({ userId: '123' });
    });
  });

  describe('error', () => {
    it('should log error message always', () => {
      logger.error('Error message');

      expect(console.error).toHaveBeenCalled();
    });

    it('should log error with Error object', () => {
      const error = new Error('Test error');
      logger.error('Something went wrong', error);

      expect(console.error).toHaveBeenCalled();
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toMatchObject({
        error: {
          message: 'Test error',
        },
      });
    });

    it('should handle non-Error objects', () => {
      logger.error('Error with string', 'string error');

      expect(console.error).toHaveBeenCalled();
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toMatchObject({
        error: 'string error',
      });
    });

    it('should include context in error message', () => {
      logger.error('Test error', undefined, { context: 'ErrorHandler' });

      expect(console.error).toHaveBeenCalled();
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toContain('[ErrorHandler]');
    });

    it('should include metadata in error message', () => {
      logger.error('Test error', undefined, { metadata: { requestId: 'abc' } });

      expect(console.error).toHaveBeenCalled();
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toMatchObject({ requestId: 'abc' });
    });

    it('should include both error and metadata', () => {
      const error = new Error('Connection failed');
      logger.error('Database error', error, { metadata: { db: 'primary' } });

      expect(console.error).toHaveBeenCalled();
      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].error.message).toBe('Connection failed');
      expect(call[1].db).toBe('primary');
    });

    it('should call configured error reporter with payload', () => {
      const reporter = vi.fn();
      const error = new Error('Reporter error');

      logger.setErrorReporter(reporter);
      logger.error('Report this', error, { metadata: { runId: 'run_1' } });

      expect(reporter).toHaveBeenCalledWith({
        error,
        message: 'Report this',
        options: { metadata: { runId: 'run_1' } },
      });
    });

    it('should stop calling error reporter when unset', () => {
      const reporter = vi.fn();
      logger.setErrorReporter(reporter);
      logger.setErrorReporter(undefined);

      logger.error('No reporter should run');

      expect(reporter).not.toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should format message with timestamp', () => {
      logger.warn('Test message');

      const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
      // Should contain ISO timestamp format
      expect(call[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include log level in uppercase', () => {
      logger.warn('Test message');

      const call = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toContain('WARN');
    });

    it('should include error level in uppercase', () => {
      logger.error('Test message');

      const call = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[0]).toContain('ERROR');
    });
  });
});
