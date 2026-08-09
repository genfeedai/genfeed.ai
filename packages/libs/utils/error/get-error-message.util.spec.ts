import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './get-error-message.util';

describe('getErrorMessage', () => {
  it('returns Unknown error for null and undefined', () => {
    expect(getErrorMessage(null)).toBe('Unknown error');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  it('returns Unknown error for other falsy values', () => {
    expect(getErrorMessage('')).toBe('Unknown error');
    expect(getErrorMessage(0)).toBe('Unknown error');
  });

  it('returns the message of an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns Unknown error for an Error without a message', () => {
    expect(getErrorMessage(new Error(''))).toBe('Unknown error');
  });

  it('returns a string message from a plain object', () => {
    expect(getErrorMessage({ message: 'object failure' })).toBe(
      'object failure',
    );
  });

  it('serializes objects whose message is not a string', () => {
    expect(getErrorMessage({ code: 500, message: 42 })).toBe(
      JSON.stringify({ code: 500, message: 42 }),
    );
  });

  it('returns string errors verbatim', () => {
    expect(getErrorMessage('plain failure')).toBe('plain failure');
  });

  it('serializes other primitives', () => {
    expect(getErrorMessage(1234)).toBe('1234');
    expect(getErrorMessage(true)).toBe('true');
  });

  it('returns Unknown error when serialization fails', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(getErrorMessage(circular)).toBe('Unknown error');
  });
});
