import { describe, expect, it } from 'vitest';

import { DurationUtil, formatDuration } from './video-duration.helper';

describe('formatDuration', () => {
  it('returns 0:00 for null/undefined', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(undefined)).toBe('0:00');
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats seconds only', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(45)).toBe('0:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(130)).toBe('2:10');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7200)).toBe('2:00:00');
  });

  it('pads minutes and seconds with zeros', () => {
    expect(formatDuration(3601)).toBe('1:00:01');
  });
});

describe('DurationUtil', () => {
  describe('validateAndNormalize', () => {
    const allowed = [4, 8, 12];

    it('returns default when no duration requested', () => {
      expect(DurationUtil.validateAndNormalize(undefined, allowed, 8)).toBe(8);
    });

    it('returns first allowed when no default and no duration', () => {
      expect(DurationUtil.validateAndNormalize(undefined, allowed)).toBe(4);
    });

    it('returns exact match when duration is in allowed list', () => {
      expect(DurationUtil.validateAndNormalize(8, allowed)).toBe(8);
    });

    it('returns nearest value when duration is not in allowed list', () => {
      expect(DurationUtil.validateAndNormalize(5, allowed)).toBe(4);
      expect(DurationUtil.validateAndNormalize(7, allowed)).toBe(8);
      expect(DurationUtil.validateAndNormalize(10, allowed)).toBe(8);
      expect(DurationUtil.validateAndNormalize(100, allowed)).toBe(12);
    });
  });

  describe('validateSoraDuration', () => {
    it('defaults to 4', () => {
      expect(DurationUtil.validateSoraDuration()).toBe(4);
    });

    it('allows 4, 8, 12', () => {
      expect(DurationUtil.validateSoraDuration(4)).toBe(4);
      expect(DurationUtil.validateSoraDuration(8)).toBe(8);
      expect(DurationUtil.validateSoraDuration(12)).toBe(12);
    });

    it('snaps to nearest allowed value', () => {
      expect(DurationUtil.validateSoraDuration(6)).toBe(4);
      expect(DurationUtil.validateSoraDuration(10)).toBe(8);
    });
  });

  describe('validateVeoDuration', () => {
    it('defaults to 8', () => {
      expect(DurationUtil.validateVeoDuration()).toBe(8);
    });

    it('allows 5 and 8 by default', () => {
      expect(DurationUtil.validateVeoDuration(5)).toBe(5);
      expect(DurationUtil.validateVeoDuration(8)).toBe(8);
    });

    it('snaps to nearest allowed value', () => {
      expect(DurationUtil.validateVeoDuration(6)).toBe(5);
      expect(DurationUtil.validateVeoDuration(7)).toBe(8);
    });

    it('accepts custom allowed durations', () => {
      expect(DurationUtil.validateVeoDuration(3, [2, 5, 10], 5)).toBe(2);
    });
  });
});
