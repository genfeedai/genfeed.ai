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
  isRecord,
} from './extract.util';

describe('extract utilities', () => {
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
