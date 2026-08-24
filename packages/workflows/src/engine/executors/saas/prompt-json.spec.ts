import { describe, expect, it } from 'vitest';
import {
  getPromptJsonWarning,
  isPromptJsonValue,
  parsePromptJson,
  prettyPrintPromptJson,
  readPromptConstructorPrompt,
  serializeStructuredPrompt,
} from './prompt-json';

describe('parsePromptJson', () => {
  it('parses valid JSON and pretty-prints with 2-space indent', () => {
    const result = parsePromptJson(
      '{"scene":"night","camera":{"move":"dolly"}}',
    );

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('expected valid JSON');
    }

    expect(result.value).toEqual({
      camera: { move: 'dolly' },
      scene: 'night',
    });
    expect(result.pretty).toBe(
      [
        '{',
        '  "scene": "night",',
        '  "camera": {',
        '    "move": "dolly"',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it('returns a non-blocking error for invalid JSON', () => {
    const result = parsePromptJson('{scene: night}');

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('expected invalid JSON');
    }

    expect(result.error.length).toBeGreaterThan(0);
  });

  it('treats empty or whitespace-only input as invalid', () => {
    expect(parsePromptJson('').isValid).toBe(false);
    expect(parsePromptJson('   \n').isValid).toBe(false);
  });

  it('accepts JSON arrays and primitives', () => {
    const arrayResult = parsePromptJson('[1, false, null]');
    expect(arrayResult.isValid).toBe(true);
    if (arrayResult.isValid) {
      expect(arrayResult.value).toEqual([1, false, null]);
    }

    const stringResult = parsePromptJson('"hello"');
    expect(stringResult.isValid).toBe(true);
    if (stringResult.isValid) {
      expect(stringResult.value).toBe('hello');
    }
  });
});

describe('prettyPrintPromptJson', () => {
  it('preserves authored key insertion order', () => {
    const pretty = prettyPrintPromptJson({ b: 1, a: 2 });
    expect(pretty).toBe(['{', '  "b": 1,', '  "a": 2', '}'].join('\n'));
  });
});

describe('serializeStructuredPrompt', () => {
  it('emits compact JSON with recursively sorted keys', () => {
    const serialized = serializeStructuredPrompt({
      zebra: { b: 2, a: 1 },
      apple: [{ z: 1, a: 2 }, 3],
    });

    expect(serialized).toBe(
      '{"apple":[{"a":2,"z":1},3],"zebra":{"a":1,"b":2}}',
    );
  });

  it('is byte-identical across calls', () => {
    const value = {
      tags: ['wide', 'night'],
      camera: { move: 'dolly', lens: '35mm' },
      scene: 'alley',
    };

    const first = serializeStructuredPrompt(value);
    const second = serializeStructuredPrompt(value);

    expect(first).toBe(second);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('round-trips values without drift', () => {
    const original = {
      count: 3,
      enabled: true,
      nested: { list: [1, 'two', null] },
      note: 'ok',
    };

    const parsed = JSON.parse(serializeStructuredPrompt(original));
    expect(parsed).toEqual({
      count: 3,
      enabled: true,
      nested: { list: [1, 'two', null] },
      note: 'ok',
    });
  });

  it('preserves array order while sorting object keys inside items', () => {
    expect(
      serializeStructuredPrompt([
        { b: 1, a: 2 },
        { d: 3, c: 4 },
      ]),
    ).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });
});

describe('getPromptJsonWarning', () => {
  it('returns null for valid JSON and a warning for invalid JSON', () => {
    expect(getPromptJsonWarning('{"ok":true}')).toBeNull();
    expect(getPromptJsonWarning('{nope')).toBe('Invalid JSON');
    expect(getPromptJsonWarning('')).toBe('Invalid JSON');
  });
});

describe('isPromptJsonValue', () => {
  it('accepts JSON values and rejects functions, dates, and undefined', () => {
    expect(isPromptJsonValue({ a: [1, true, null] })).toBe(true);
    expect(isPromptJsonValue(() => undefined)).toBe(false);
    expect(isPromptJsonValue(new Date())).toBe(false);
    expect(isPromptJsonValue(undefined)).toBe(false);
  });
});

describe('readPromptConstructorPrompt', () => {
  it('returns a string payload unchanged', () => {
    expect(readPromptConstructorPrompt('hello')).toBe('hello');
  });

  it('extracts prompt from a structured JSON payload', () => {
    expect(
      readPromptConstructorPrompt({
        prompt: '{"scene":"night"}',
        promptFormat: 'json',
        structuredPrompt: { scene: 'night' },
      }),
    ).toBe('{"scene":"night"}');
  });

  it('returns an empty string for unknown payloads', () => {
    expect(readPromptConstructorPrompt(null)).toBe('');
    expect(readPromptConstructorPrompt({ text: 'nope' })).toBe('');
  });
});
