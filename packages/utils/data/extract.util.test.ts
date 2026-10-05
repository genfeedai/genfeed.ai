import { describe, expect, it } from 'vitest';
import {
  extractBoolean,
  extractFirstString,
  extractHashtags,
  extractString,
  extractStringArray,
  getNestedValue,
  getNumberByPaths,
  getStringByPaths,
  isObjectLike,
  isRecord,
  readNonBlankString,
  readNonBlankStringOrNull,
  readNonEmptyString,
  readNonEmptyStringOrNull,
  readRawString,
  readRecord,
  readRecordCopy,
  readRecordOrNull,
  readRecordOrUndefined,
  readString,
  readTrimmedStringOrNull,
} from './extract.util';

describe('extract utilities', () => {
  it('reads strings with the documented trimming and empty handling', () => {
    expect(readString('  a ')).toBe('a');
    expect(readString('   ')).toBeUndefined();
    expect(readString(1)).toBeUndefined();
    expect(readNonEmptyString('  a ')).toBe('  a ');
    expect(readNonEmptyString('   ')).toBe('   ');
    expect(readNonEmptyString('')).toBeUndefined();
    expect(readNonBlankString('  a ')).toBe('  a ');
    expect(readNonBlankString('   ')).toBeUndefined();
    expect(readRawString('')).toBe('');
    expect(readRawString(null)).toBeUndefined();
  });

  it('reads null-returning string variants', () => {
    expect(readNonEmptyStringOrNull('  a ')).toBe('  a ');
    expect(readNonEmptyStringOrNull('')).toBeNull();
    expect(readNonEmptyStringOrNull(1)).toBeNull();
    expect(readTrimmedStringOrNull('  a ')).toBe('a');
    expect(readTrimmedStringOrNull('   ')).toBeNull();
    expect(readNonBlankStringOrNull('  a ')).toBe('  a ');
    expect(readNonBlankStringOrNull('   ')).toBeNull();
    expect(readNonBlankStringOrNull(null)).toBeNull();
  });

  it('copies records and accepts arrays only as object-like', () => {
    const input = { a: 1 };
    const copy = readRecordCopy(input);
    expect(copy).toEqual(input);
    expect(copy).not.toBe(input);
    expect(readRecordCopy([])).toEqual({});
    expect(readRecordCopy(null)).toEqual({});
    expect(isObjectLike([])).toBe(true);
    expect(isObjectLike(input)).toBe(true);
    expect(isObjectLike(null)).toBe(false);
    expect(isObjectLike('x')).toBe(false);
  });

  it('reads records without treating arrays or null as records', () => {
    const input = { a: 1 };
    expect(readRecord(input)).toBe(input);
    expect(readRecord([])).toEqual({});
    expect(readRecord(null)).toEqual({});
    expect(readRecordOrNull(input)).toBe(input);
    expect(readRecordOrNull([])).toBeNull();
    expect(readRecordOrUndefined(input)).toBe(input);
    expect(readRecordOrUndefined('x')).toBeUndefined();
  });

  it('identifies plain records without treating arrays as records', () => {
    expect(isRecord({ key: 'value' })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it('reads string, boolean, array, and nested values safely', () => {
    const input = {
      enabled: true,
      nested: { count: '42', label: '  Ready  ' },
      primary: '',
      secondary: 'fallback',
      tags: ['one', 2, 'two', ''],
    };

    expect(extractString(input, 'secondary')).toBe('fallback');
    expect(extractFirstString(input, 'primary', 'secondary')).toBe('fallback');
    expect(extractStringArray(input, 'tags')).toEqual(['one', 'two']);
    expect(extractBoolean(input, 'enabled')).toBe(true);
    expect(getNestedValue(input, ['nested', 'count'])).toBe('42');
    expect(getStringByPaths(input, [['nested', 'label']])).toBe('Ready');
    expect(getNumberByPaths(input, [['nested', 'count']])).toBe(42);
  });

  it('extracts hashtags without leading hash characters', () => {
    expect(extractHashtags('Ship #content with #AI tools')).toEqual([
      'content',
      'AI',
    ]);
  });
});
