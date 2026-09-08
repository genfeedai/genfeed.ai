import {
  formatExecutionDuration,
  formatMinutesSeconds,
} from '@helpers/formatting/duration/duration.helper';
import { describe, expect, it } from 'vitest';

describe('formatMinutesSeconds', () => {
  it.each<[number, string]>([
    [0, '0:00'],
    [5.9, '0:05'],
    [59.999, '0:59'],
    [60, '1:00'],
    [3661.9, '61:01'],
    [-61.5, '-2:-2'],
    [Number.NaN, 'NaN:NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity:NaN'],
    [Number.NEGATIVE_INFINITY, '-Infinity:NaN'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatMinutesSeconds(seconds)).toBe(expected);
  });
});

describe('formatExecutionDuration', () => {
  it.each<[number, string]>([
    [0, '0ms'],
    [999.5, '999.5ms'],
    [1000, '1.0s'],
    [59999, '60.0s'],
    [60000, '1.0m'],
    [3600000, '60.0m'],
    [-1.5, '-1.5ms'],
    [Number.NaN, 'NaNm'],
    [Number.POSITIVE_INFINITY, 'Infinitym'],
    [Number.NEGATIVE_INFINITY, '-Infinityms'],
  ])('formats %s milliseconds as %s', (milliseconds, expected) => {
    expect(formatExecutionDuration(milliseconds)).toBe(expected);
  });
});
