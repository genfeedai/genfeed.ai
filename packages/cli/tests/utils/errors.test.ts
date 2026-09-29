import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  AuthError,
  formatError,
  GenfeedError,
  handleError,
  NoBrandError,
  setReplMode,
} from '../../src/utils/errors';

// Mock chalk to return plain strings
vi.mock('chalk', () => ({
  default: {
    dim: (s: string) => `[DIM]${s}[/DIM]`,
    red: (s: string) => `[RED]${s}[/RED]`,
  },
}));

describe('utils/errors', () => {
  describe('GenfeedError', () => {
    it('creates error with message', () => {
      const error = new GenfeedError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('GenfeedError');
      expect(error.suggestion).toBeUndefined();
    });
  });

  describe('AuthError', () => {
    it('creates error with default message', () => {
      const error = new AuthError();
      expect(error.message).toBe('Not authenticated');
      expect(error.name).toBe('AuthError');
      expect(error.suggestion).toBe('Run `gf login` to authenticate');
    });
  });

  describe('ApiError', () => {
    it('creates error with message only', () => {
      const error = new ApiError('API failed');
      expect(error.message).toBe('API failed');
      expect(error.name).toBe('ApiError');
      expect(error.statusCode).toBeUndefined();
      expect(error.suggestion).toBeUndefined();
    });

    it('creates error with status code and suggestion', () => {
      const error = new ApiError('Forbidden', 403, 'Check your permissions');
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.suggestion).toBe('Check your permissions');
    });
  });

  describe('NoBrandError', () => {
    it('creates error with default message', () => {
      const error = new NoBrandError();
      expect(error.message).toBe('No brand selected');
      expect(error.name).toBe('NoBrandError');
      expect(error.suggestion).toBe('Run `gf brand use` to choose a brand');
    });
  });

  describe('formatError', () => {
    it('formats AuthError', () => {
      const error = new AuthError();
      const formatted = formatError(error);
      expect(formatted).toContain('Not authenticated');
      expect(formatted).toContain('gf login');
    });
  });

  describe('handleError', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('prints error and exits with code 1', () => {
      const error = new GenfeedError('Fatal error');

      expect(() => handleError(error)).toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles standard Error', () => {
      const error = new Error('Standard error');

      expect(() => handleError(error)).toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('handles unknown error types', () => {
      expect(() => handleError({ weird: 'object' })).toThrow('process.exit called');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('rethrows instead of exiting while in REPL mode', () => {
      const error = new GenfeedError('REPL error');
      mockExit.mockClear();
      setReplMode(true);
      try {
        expect(() => handleError(error)).toThrow(error);
        expect(mockConsoleError).toHaveBeenCalled();
        expect(mockExit).not.toHaveBeenCalled();
      } finally {
        setReplMode(false);
      }
    });
  });
});
