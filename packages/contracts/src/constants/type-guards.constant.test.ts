import { describe, expect, it } from 'vitest';
import {
  isObjectLike,
  isRecord,
  readNonBlankString,
  readNonEmptyString,
  readRawString,
  readRecord,
  readRecordOrNull,
  readRecordOrUndefined,
  readString,
} from './type-guards.constant';

describe('type-guards.constant', () => {
  describe('isRecord', () => {
    it.each([null, undefined, '', 0, false, 'text', [], ['video']])(
      'rejects non-record payloads: %s',
      (value) => {
        expect(isRecord(value)).toBe(false);
      },
    );

    it('accepts plain objects and narrows their properties', () => {
      const value: unknown = { videoUrl: 'https://example.com/video.mp4' };
      if (!isRecord(value)) throw new Error('Expected an object payload');
      expect(value.videoUrl).toBe('https://example.com/video.mp4');
    });

    it('rejects an array carrying object-like properties', () => {
      expect(isRecord(Object.assign([], { videoUrl: 'x' }))).toBe(false);
    });
  });

  it('isObjectLike accepts arrays but not null', () => {
    expect(isObjectLike([])).toBe(true);
    expect(isObjectLike({})).toBe(true);
    expect(isObjectLike(null)).toBe(false);
  });

  it('string readers keep their trimming contracts', () => {
    expect(readString('  a ')).toBe('a');
    expect(readString('   ')).toBeUndefined();
    expect(readNonEmptyString(' a ')).toBe(' a ');
    expect(readNonEmptyString('')).toBeUndefined();
    expect(readNonBlankString('  ')).toBeUndefined();
    expect(readRawString('')).toBe('');
    expect(readRawString(1)).toBeUndefined();
  });

  it('record readers exclude arrays and fall back per variant', () => {
    const record = { a: 1 };
    expect(readRecord(record)).toBe(record);
    expect(readRecord([])).toEqual({});
    expect(readRecordOrNull('x')).toBeNull();
    expect(readRecordOrUndefined(null)).toBeUndefined();
  });
});
