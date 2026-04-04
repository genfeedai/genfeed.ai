import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  AuthError,
  BaseCliError,
  formatError,
  GenfeedError,
  handleError,
  NoBrandError,
} from '../../src/utils/errors.js';

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

    it('creates error with message and suggestion', () => {
      const error = new GenfeedError('Test error', 'Try this instead');
      expect(error.message).toBe('Test error');
      expect(error.suggestion).toBe('Try this instead');
    });

    it('is instance of Error', () => {
      const error = new GenfeedError('Test');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('AuthError', () => {
    it('creates error with default message', () => {
      const error = new AuthError();
      expect(error.message).toBe('Not authenticated');
      expect(error.name).toBe('AuthError');
      expect(error.suggestion).toBe('Run `gf login` to authenticate');
    });

    it('creates error with custom message', () => {
      const error = new AuthError('Custom auth error');
      expect(error.message).toBe('Custom auth error');
      expect(error.suggestion).toBe('Run `gf login` to authenticate');
    });

    it('is instance of GenfeedError', () => {
      const error = new AuthError();
      expect(error).toBeInstanceOf(GenfeedError);
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

    it('creates error with status code', () => {
      const error = new ApiError('Not found', 404);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });

    it('creates error with status code and suggestion', () => {
      const error = new ApiError('Forbidden', 403, 'Check your permissions');
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.suggestion).toBe('Check your permissions');
    });

    it('is instance of BaseCliError', () => {
      const error = new ApiError('Test');
      expect(error).toBeInstanceOf(BaseCliError);
    });
  });

  describe('NoBrandError', () => {
    it('creates error with default message', () => {
      const error = new NoBrandError();
      expect(error.message).toBe('No brand selected');
      expect(error.name).toBe('NoBrandError');
      expect(error.suggestion).toBe('Run `gf brands select` to choose a brand');
    });

    it('is instance of GenfeedError', () => {
      const error = new NoBrandError();
      expect(error).toBeInstanceOf(GenfeedError);
    });
  });

  describe('formatError', () => {
    it('formats GenfeedError without suggestion', () => {
      const error = new GenfeedError('Something went wrong');
      const formatted = formatError(error);
      expect(formatted).toContain('Something went wrong');
    });

    it('formats GenfeedError with suggestion', () => {
      const error = new GenfeedError('Something went wrong', 'Try again');
      const formatted = formatError(error);
      expect(formatted).toContain('Something went wrong');
      expect(formatted).toContain('Try again');
    });

    it('formats AuthError', () => {
      const error = new AuthError();
      const formatted = formatError(error);
      expect(formatted).toContain('Not authenticated');
      expect(formatted).toContain('gf login');
    });

    it('formats ApiError', () => {
      const error = new ApiError('Bad request', 400);
      const formatted = formatError(error);
      expect(formatted).toContain('Bad request');
    });

    it('formats standard Error', () => {
      const error = new Error('Standard error');
      const formatted = formatError(error);
      expect(formatted).toContain('Standard error');
    });

    it('formats unknown error', () => {
      const formatted = formatError('just a string');
      expect(formatted).toContain('unknown error');
    });

    it('formats null error', () => {
      const formatted = formatError(null);
      expect(formatted).toContain('unknown error');
    });

    it('formats undefined error', () => {
      const formatted = formatError(undefined);
      expect(formatted).toContain('unknown error');
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
  });
});
