import { describe, expect, it } from 'vitest';
import {
  crunCreditsEqual,
  crunCreditsToMicros,
  crunCreditsToUsd,
  crunCreditTotal,
} from './crun-provider-credits';

describe('frozen Crun provider credit conversion', () => {
  it('compares equivalent decimal receipts without float or lexical equality', () => {
    expect(crunCreditsEqual('0008.000', '8')).toBe(true);
    expect(crunCreditsEqual('1.5', '1.500')).toBe(true);
    expect(crunCreditsEqual('8.0000000000000001', '8')).toBe(false);
    expect(crunCreditsEqual('bad', 'bad')).toBe(false);
  });
  it.each(['', '-1', 'NaN', 'Infinity', '1e3', ' 8', '.5'])(
    'rejects unsupported decimal %s',
    (value) => {
      expect(crunCreditsToUsd(value, '1000')).toBeNull();
      expect(crunCreditsToMicros('8', value)).toBeNull();
    },
  );
  it('requires explicit positive exchange rate with no fallback', () => {
    expect(crunCreditsToUsd('8', '0')).toBeNull();
    expect(crunCreditsToUsd('8', '1000')).toBe(0.008);
    expect(crunCreditsToUsd('1.5', '500')).toBe(0.003);
  });
  it('preserves one and four output provider totals before customer group rounding', () => {
    expect(crunCreditTotal('8', 1)).toBe('8');
    expect(crunCreditTotal('8', 4)).toBe('32');
    expect(crunCreditTotal('6', 4)).toBe('24');
    expect(crunCreditTotal('10', 4)).toBe('40');
    expect(crunCreditTotal('8', 5)).toBeNull();
  });
  it('rounds actual provider expense once including fractional/zero/half-micro receipts', () => {
    expect(crunCreditsToMicros('8', '1000')).toBe(8000);
    expect(crunCreditsToMicros('0', '1000')).toBe(0);
    expect(crunCreditsToMicros('1.5', '3')).toBe(500000);
    expect(crunCreditsToMicros('1', '2000000')).toBe(1);
    expect(crunCreditsToMicros('1', '3000000')).toBe(0);
    expect(crunCreditsToMicros('1000000000000000000000000', '1')).toBeNull();
  });
});
