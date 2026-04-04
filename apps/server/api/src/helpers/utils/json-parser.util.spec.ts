import { describe, expect, it } from 'vitest';

import { JsonParserUtil } from './json-parser.util';

describe('JsonParserUtil', () => {
  describe('parseAIResponse', () => {
    it('parses clean JSON directly', () => {
      const input = '{"key": "value", "num": 42}';
      const result = JsonParserUtil.parseAIResponse<{
        key: string;
        num: number;
      }>(input);
      expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('parses JSON wrapped in markdown code block with language tag', () => {
      const input = '```json\n{"foo": "bar"}\n```';
      const result = JsonParserUtil.parseAIResponse<{ foo: string }>(input);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('parses JSON wrapped in plain markdown code block', () => {
      const input = '```\n{"hello": "world"}\n```';
      const result = JsonParserUtil.parseAIResponse<{ hello: string }>(input);
      expect(result).toEqual({ hello: 'world' });
    });

    it('extracts JSON object embedded in surrounding text', () => {
      const input = 'Sure, here is the response: {"result": true} — done!';
      const result = JsonParserUtil.parseAIResponse<{ result: boolean }>(input);
      expect(result).toEqual({ result: true });
    });

    it('extracts JSON array from response text', () => {
      const input = 'Here are the items: [1, 2, 3]';
      const result = JsonParserUtil.parseAIResponse<number[]>(input);
      expect(result).toEqual([1, 2, 3]);
    });

    it('returns fallback when content is empty and fallback is provided', () => {
      const fallback = { default: true };
      const result = JsonParserUtil.parseAIResponse<{ default: boolean }>(
        '',
        fallback,
      );
      expect(result).toEqual(fallback);
    });

    it('throws when content is empty and no fallback is provided', () => {
      expect(() => JsonParserUtil.parseAIResponse('')).toThrow(
        'Empty AI response',
      );
    });

    it('throws when JSON is invalid and no fallback is provided', () => {
      expect(() =>
        JsonParserUtil.parseAIResponse('not json at all, no braces either'),
      ).toThrow('Invalid JSON in AI response');
    });

    it('returns fallback when JSON is invalid and fallback is provided', () => {
      const fallback = { error: 'parse failed' };
      const result = JsonParserUtil.parseAIResponse<{ error: string }>(
        'garbage text',
        fallback,
      );
      expect(result).toEqual(fallback);
    });

    it('parses whitespace-only content using fallback', () => {
      const fallback = { empty: true };
      const result = JsonParserUtil.parseAIResponse<{ empty: boolean }>(
        '   ',
        fallback,
      );
      expect(result).toEqual(fallback);
    });
  });

  describe('safeParse', () => {
    it('returns parsed value on valid JSON', () => {
      const result = JsonParserUtil.safeParse<{ a: number }>('{"a": 1}');
      expect(result).toEqual({ a: 1 });
    });

    it('returns null on invalid JSON without throwing', () => {
      const result = JsonParserUtil.safeParse('invalid json');
      expect(result).toBeNull();
    });

    it('returns null on empty string without throwing', () => {
      const result = JsonParserUtil.safeParse('');
      expect(result).toBeNull();
    });
  });
});
