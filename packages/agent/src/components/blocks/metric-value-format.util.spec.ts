import { describe, expect, it } from 'vitest';
import {
  extractMetricSuffix,
  formatAnimatedValue,
} from './metric-value-format.util';

describe('metric value formatting', () => {
  it.each([
    ['42K', 'K'],
    ['42mb', 'mb'],
    ['42%', '%'],
    ['42', ''],
  ])('extracts the suffix from %s', (template, expected) => {
    expect(extractMetricSuffix(template)).toBe(expected);
  });

  it('preserves suffix and decimal precision while animating', () => {
    expect(formatAnimatedValue(12.34, '12.3K')).toBe('12.3K');
    expect(formatAnimatedValue(12.34, '12%')).toBe('12%');
  });

  it('handles a long suffix in a single backwards scan', () => {
    const suffix = '%'.repeat(50_000);
    expect(extractMetricSuffix(`1${suffix}`)).toBe(suffix);
  });
});
