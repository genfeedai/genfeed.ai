import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BaseCliError, formatError, handleError } from '../src/index';

describe('BaseCliError', () => {
  it('carries message, name, and optional suggestion', () => {
    const error = new BaseCliError('boom', 'try again');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
    expect(error.name).toBe('BaseCliError');
    expect(error.suggestion).toBe('try again');
  });

  it('leaves suggestion undefined when omitted', () => {
    const error = new BaseCliError('boom');

    expect(error.suggestion).toBeUndefined();
  });
});

describe('ApiError', () => {
  it('extends BaseCliError with a status code', () => {
    const error = new ApiError('not found', 404, 'check the id');

    expect(error).toBeInstanceOf(BaseCliError);
    expect(error.name).toBe('ApiError');
    expect(error.message).toBe('not found');
    expect(error.statusCode).toBe(404);
    expect(error.suggestion).toBe('check the id');
  });

  it('leaves statusCode undefined when omitted', () => {
    const error = new ApiError('timeout');

    expect(error.statusCode).toBeUndefined();
    expect(error.suggestion).toBeUndefined();
  });
});

describe('formatError', () => {
  it('formats a BaseCliError with its suggestion', () => {
    const output = formatError(new BaseCliError('bad flag', 'use --help'));

    expect(output).toContain('✖ bad flag');
    expect(output).toContain('use --help');
  });

  it('formats a BaseCliError without a suggestion on a single line', () => {
    const output = formatError(new BaseCliError('bad flag'));

    expect(output).toContain('✖ bad flag');
    expect(output).not.toContain('\n');
  });

  it('formats a generic Error', () => {
    const output = formatError(new Error('plain failure'));

    expect(output).toContain('✖ plain failure');
  });

  it('formats non-Error values as unknown errors', () => {
    expect(formatError('string failure')).toContain(
      '✖ An unknown error occurred',
    );
    expect(formatError(undefined)).toContain('✖ An unknown error occurred');
    expect(formatError(42)).toContain('✖ An unknown error occurred');
  });
});

describe('handleError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints the formatted error and exits with code 1', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    expect(() => handleError(new BaseCliError('fatal'))).toThrow(
      'process.exit called',
    );
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toContain('✖ fatal');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('re-throws the original error in REPL mode without exiting', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const original = new ApiError('rate limited', 429);

    expect(() => handleError(original, { replMode: true })).toThrow(original);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
