import { describe, expect, it } from 'vitest';
import {
  mergeReplyContext,
  numberValue,
  readRecord,
  requiredString,
} from './reply-bot-orchestrator-parsing.util';

describe('reply-bot-orchestrator-parsing.util', () => {
  describe('readRecord', () => {
    it('returns a plain object as-is', () => {
      expect(readRecord({ a: 1 })).toEqual({ a: 1 });
    });

    it('returns an empty object for null, arrays, and primitives', () => {
      expect(readRecord(null)).toEqual({});
      expect(readRecord(undefined)).toEqual({});
      expect(readRecord(['a'])).toEqual({});
      expect(readRecord('x')).toEqual({});
    });
  });

  describe('requiredString', () => {
    it('returns a non-empty string', () => {
      expect(requiredString('hi', 'field')).toBe('hi');
    });

    it('throws for a missing or empty value', () => {
      expect(() => requiredString(undefined, 'botConfigId')).toThrow(
        'Reply bot action requires botConfigId',
      );
      expect(() => requiredString('', 'botConfigId')).toThrow(
        'Reply bot action requires botConfigId',
      );
      expect(() => requiredString(42, 'botConfigId')).toThrow(
        'Reply bot action requires botConfigId',
      );
    });
  });

  describe('numberValue', () => {
    it('returns a finite number as-is', () => {
      expect(numberValue(3)).toBe(3);
    });

    it('defaults to 0 for non-finite or non-number values', () => {
      expect(numberValue(Number.NaN)).toBe(0);
      expect(numberValue('3')).toBe(0);
      expect(numberValue(undefined)).toBe(0);
    });
  });

  describe('mergeReplyContext', () => {
    it('joins both contexts with a blank line', () => {
      expect(mergeReplyContext('bot', 'candidate')).toBe('bot\n\ncandidate');
    });

    it('falls back to undefined when both are empty', () => {
      expect(mergeReplyContext(undefined, undefined)).toBeUndefined();
    });

    it('returns the one present context', () => {
      expect(mergeReplyContext('bot', undefined)).toBe('bot');
      expect(mergeReplyContext(undefined, 'candidate')).toBe('candidate');
    });
  });
});
