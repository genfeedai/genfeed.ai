import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { describe, expect, it } from 'vitest';

describe('getErrorMessage', () => {
  it('returns "Unknown error" for Error instance with empty message', () => {
    const error = new Error('');
    expect(getErrorMessage(error)).toBe('Unknown error');
  });

  it('returns the string value for string errors', () => {
    expect(getErrorMessage('oops')).toBe('oops');
  });

  it('ignores non-string message property on plain object', () => {
    const error = { message: 42 };
    // Falls through to JSON.stringify
    const result = getErrorMessage(error);
    expect(result).toBe('{"message":42}');
  });

  it('returns "Unknown error" for non-circular objects that fail stringify', () => {
    // Circular reference cannot be stringified
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(getErrorMessage(circular)).toBe('Unknown error');
  });

  it('returns "Unknown error" for false (falsy boolean)', () => {
    expect(getErrorMessage(false)).toBe('Unknown error');
  });
});
