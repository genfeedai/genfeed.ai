import { describe, expect, it } from 'vitest';
import { parseFrequencyToMs } from './content-frequency.util';

describe('parseFrequencyToMs', () => {
  it('parses hourly frequency', () => {
    expect(parseFrequencyToMs('hourly')).toBe(3_600_000);
  });

  it('parses twice-daily frequency', () => {
    expect(parseFrequencyToMs('twice-daily')).toBe(43_200_000);
  });

  it('parses daily frequency', () => {
    expect(parseFrequencyToMs('daily')).toBe(86_400_000);
  });

  it('parses weekly frequency', () => {
    expect(parseFrequencyToMs('weekly')).toBe(604_800_000);
  });

  it('is case insensitive', () => {
    expect(parseFrequencyToMs('Weekly')).toBe(604_800_000);
  });

  it('defaults to daily for an unknown frequency', () => {
    expect(parseFrequencyToMs('unknown')).toBe(86_400_000);
  });

  it('defaults to daily when frequency is undefined', () => {
    expect(parseFrequencyToMs(undefined)).toBe(86_400_000);
  });
});
