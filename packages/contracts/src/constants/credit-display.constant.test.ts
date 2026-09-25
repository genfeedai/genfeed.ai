import { describe, expect, it } from 'vitest';
import {
  CREDIT_BALANCE_COMPACT_THRESHOLD,
  formatCreditBalance,
  formatCreditBalanceExact,
  formatCreditCost,
  formatCreditCostEstimate,
  isCompactCreditBalance,
} from './credit-display.constant';

describe('formatCreditBalance', () => {
  it('rounds down to whole credits with thousands separators', () => {
    expect(formatCreditBalance(4900.97)).toBe('4,900');
    expect(formatCreditBalance(0.99)).toBe('0');
    expect(formatCreditBalance(99_999.99)).toBe('99,999');
  });

  it('never rounds a fractional balance up', () => {
    expect(formatCreditBalance(12.999999)).toBe('12');
  });

  it('treats null, undefined, and non-finite as zero', () => {
    expect(formatCreditBalance(null)).toBe('0');
    expect(formatCreditBalance(undefined)).toBe('0');
    expect(formatCreditBalance(Number.NaN)).toBe('0');
  });

  it('switches to the compact form at the 100k threshold', () => {
    expect(CREDIT_BALANCE_COMPACT_THRESHOLD).toBe(100_000);
    expect(formatCreditBalance(100_000)).toBe('100k');
    expect(formatCreditBalance(124_999.9)).toBe('124k');
    expect(formatCreditBalance(999_999)).toBe('999k');
  });

  it('keeps one decimal, rounded down, from a million up', () => {
    expect(formatCreditBalance(1_000_000)).toBe('1M');
    expect(formatCreditBalance(1_299_999)).toBe('1.2M');
    expect(formatCreditBalance(12_345_678)).toBe('12.3M');
    expect(formatCreditBalance(2_050_000_000)).toBe('2B');
  });

  it('reports when a balance is abbreviated so callers add the exact title', () => {
    expect(isCompactCreditBalance(99_999.9)).toBe(false);
    expect(isCompactCreditBalance(100_000)).toBe(true);
    expect(formatCreditBalanceExact(1_299_999.7)).toBe('1,299,999');
  });
});

describe('formatCreditCost', () => {
  it('shows Free for zero', () => {
    expect(formatCreditCost(0)).toBe('Free');
    expect(formatCreditCost(0, { unit: 'credits' })).toBe('Free');
  });

  it('shows <0.1 below a tenth of a credit', () => {
    expect(formatCreditCost(0.0014)).toBe('<0.1');
    expect(formatCreditCost(0.049)).toBe('<0.1');
    expect(formatCreditCost(0.04, { unit: 'credits' })).toBe('<0.1 credits');
  });

  it('keeps at most one decimal with separators', () => {
    expect(formatCreditCost(0.1)).toBe('0.1');
    expect(formatCreditCost(0.14)).toBe('0.1');
    expect(formatCreditCost(1.25)).toBe('1.3');
    expect(formatCreditCost(50)).toBe('50');
    expect(formatCreditCost(1234.56)).toBe('1,234.6');
  });

  it('keeps the sign of refund rows', () => {
    expect(formatCreditCost(-2.34)).toBe('-2.3');
  });

  it('prefixes estimates with ≈ but never Free', () => {
    expect(formatCreditCostEstimate(0.18, { unit: 'credits' })).toBe(
      '≈ 0.2 credits',
    );
    expect(formatCreditCostEstimate(0)).toBe('Free');
  });
});
