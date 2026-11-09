import { describe, expect, it } from 'vitest';
import { addOneMonth } from './subscription-period.util';

describe('addOneMonth', () => {
  it.each([
    ['2026-01-15T10:30:00.000Z', '2026-02-15T10:30:00.000Z'],
    ['2026-01-31T08:00:00.000Z', '2026-02-28T08:00:00.000Z'],
    ['2028-01-31T08:00:00.000Z', '2028-02-29T08:00:00.000Z'],
    ['2026-12-31T23:59:59.000Z', '2027-01-31T23:59:59.000Z'],
    ['2026-03-31T00:00:00.000Z', '2026-04-30T00:00:00.000Z'],
  ])('renews %s on %s', (start, renewal) => {
    expect(addOneMonth(new Date(start)).toISOString()).toBe(renewal);
  });
});
