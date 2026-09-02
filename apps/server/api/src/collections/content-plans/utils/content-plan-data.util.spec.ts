import {
  asDate,
  asNumber,
  asRecord,
  asString,
  dateToTime,
  serializeDate,
} from '@api/collections/content-plans/utils/content-plan-data.util';
import { describe, expect, it } from 'vitest';

describe('content-plan-data.util', () => {
  it('copies plain objects and rejects arrays or primitives', () => {
    expect(asRecord({ a: 1 })).toEqual({ a: 1 });
    expect(asRecord([1, 2])).toEqual({});
    expect(asRecord(null)).toEqual({});
    expect(asRecord('x')).toEqual({});
  });

  it('parses finite numbers and optional fallbacks', () => {
    expect(asNumber(4)).toBe(4);
    expect(asNumber('12.5')).toBe(12.5);
    expect(asNumber('nope')).toBeUndefined();
    expect(asNumber('nope', 3)).toBe(3);
    expect(asNumber(Number.NaN, 1)).toBe(1);
  });

  it('narrows strings and parses dates', () => {
    expect(asString('ok')).toBe('ok');
    expect(asString(1)).toBeUndefined();

    const date = new Date('2026-08-10T00:00:00.000Z');
    expect(asDate(date)).toBe(date);
    expect(asDate('2026-08-10T00:00:00.000Z')?.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z',
    );
    expect(asDate('not-a-date')).toBeNull();
    expect(dateToTime(date)).toBe(date.getTime());
    expect(dateToTime(undefined)).toBeNull();
    expect(serializeDate(date)).toBe('2026-08-10T00:00:00.000Z');
    expect(serializeDate('bad')).toBeNull();
  });
});
