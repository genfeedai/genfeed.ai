import { withSimulatedNumberLocale } from '@shared/localeTestUtils';
import { describe, expect, it } from 'vitest';

describe('withSimulatedNumberLocale', () => {
  it('simulates defaults for Number methods and Intl.NumberFormat', () => {
    withSimulatedNumberLocale('de-DE', () => {
      expect((1000).toLocaleString()).toBe('1.000');
      expect(new Intl.NumberFormat().format(1000)).toBe('1.000');
      expect((1000).toLocaleString('en-US')).toBe('1,000');
      expect(new Intl.NumberFormat('en-US').format(1000)).toBe('1,000');
    });
  });
});
