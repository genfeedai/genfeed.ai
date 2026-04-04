import { describe, expect, it } from 'vitest';

import { getErrorMessage } from './get-error-message.util';

describe('getErrorMessage', () => {
  it('returns error.message for Error instances', () => {
    const error = new Error('something went wrong');
    expect(getErrorMessage(error)).toBe('something went wrong');
  });

  it('returns "Unknown error" for Error instance with empty message', () => {
    const error = new Error('');
    expect(getErrorMessage(error)).toBe('Unknown error');
  });

  it('returns the string value for string errors', () => {
    expect(getErrorMessage('oops')).toBe('oops');
  });

  it('returns "Unknown error" for null', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
  });

  it('returns "Unknown error" for undefined', () => {
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('returns message from plain object with message property', () => {
    const error = { message: 'plain object error' };
    expect(getErrorMessage(error)).toBe('plain object error');
  });

  it('ignores non-string message property on plain object', () => {
    const error = { message: 42 };
    // Falls through to JSON.stringify
    const result = getErrorMessage(error);
    expect(result).toBe('{"message":42}');
  });

  it('JSON.stringifies an unrecognized object', () => {
    const error = { code: 404, reason: 'not found' };
    expect(getErrorMessage(error)).toBe('{"code":404,"reason":"not found"}');
  });

  it('returns "Unknown error" for non-circular objects that fail stringify', () => {
    // Circular reference cannot be stringified
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(getErrorMessage(circular)).toBe('Unknown error');
  });

  it('returns "Unknown error" for 0 (falsy number)', () => {
    expect(getErrorMessage(0)).toBe('Unknown error');
  });

  it('returns "Unknown error" for false (falsy boolean)', () => {
    expect(getErrorMessage(false)).toBe('Unknown error');
  });
});
