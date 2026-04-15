import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatFullDate,
  formatRelativeDate,
  formatRelativeDateVerbose,
  formatShortDate,
} from '../../utils/format-date';

describe('format-date utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the input when the relative date is invalid', () => {
    expect(formatRelativeDate('not-a-date')).toBe('not-a-date');
    expect(formatRelativeDateVerbose('not-a-date')).toBe('not-a-date');
  });

  it('returns the input when full and short dates are invalid', () => {
    expect(formatFullDate('not-a-date')).toBe('not-a-date');
    expect(formatShortDate('not-a-date')).toBe('not-a-date');
  });

  it('formats recent timestamps as relative times', () => {
    expect(formatRelativeDate('2026-04-15T11:55:00.000Z')).toBe('5m ago');
    expect(formatRelativeDateVerbose('2026-04-15T10:00:00.000Z')).toBe(
      '2 hours ago',
    );
  });

  it('formats older timestamps as calendar dates', () => {
    expect(formatRelativeDate('2026-04-01T12:00:00.000Z')).toBe('4/1/2026');
    expect(formatRelativeDateVerbose('2026-04-01T12:00:00.000Z')).toBe(
      '4/1/2026',
    );
  });
});
