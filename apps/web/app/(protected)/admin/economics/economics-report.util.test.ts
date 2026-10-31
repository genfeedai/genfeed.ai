import { describe, expect, it } from 'vitest';
import {
  buildEconomicsRange,
  formatCount,
  formatLedgerTimestamp,
  formatMarginPercent,
  formatUsd,
  formatUsdAxis,
  percentChange,
} from './economics-report.util';

describe('economics report helpers', () => {
  it('formats money, sub-dollar provider costs, and missing margins', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.0021)).toBe('$0.0021');
    expect(formatUsd(-12)).toBe('-$12.00');
    expect(formatMarginPercent(null)).toBe('—');
    expect(formatMarginPercent(98.456)).toBe('98.5%');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('keeps axis ticks short once values are large', () => {
    expect(formatUsdAxis(1234.4)).toBe('$1,234');
    expect(formatUsdAxis(2.5)).toBe('$2.50');
  });

  it('hides the trend when there is nothing to compare against', () => {
    expect(percentChange(50, 0)).toBeUndefined();
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(-5, -10)).toBe(50);
  });

  it('builds an inclusive UTC day range', () => {
    expect(
      buildEconomicsRange(30, new Date('2026-09-30T12:00:00.000Z')),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('formats ledger timestamps in UTC and dashes an empty ledger', () => {
    expect(formatLedgerTimestamp('2026-09-30T12:34:56.000Z')).toBe(
      '2026-09-30 12:34',
    );
    expect(formatLedgerTimestamp(null)).toBe('—');
  });
});
