import { describe, expect, it } from 'vitest';
import {
  LIFETIME_DEAL_DEFAULT_MONTHLY_CREDITS,
  lifetimeGrantReferenceId,
  nextLifetimeGrantDate,
} from './lifetime-deal';

describe('nextLifetimeGrantDate', () => {
  it.each([
    ['2026-11-13T20:00:00.000Z', '2026-12-13T20:00:00.000Z'],
    ['2026-12-31T08:30:00.000Z', '2027-01-31T08:30:00.000Z'],
    ['2027-01-31T08:30:00.000Z', '2027-02-28T08:30:00.000Z'],
    ['2028-01-31T08:30:00.000Z', '2028-02-29T08:30:00.000Z'],
  ])('moves %s to %s', (due, expected) => {
    expect(nextLifetimeGrantDate(new Date(due)).toISOString()).toBe(expected);
  });
});

describe('lifetime deal constants', () => {
  it('defaults the monthly allowance to the Pro tier', () => {
    expect(LIFETIME_DEAL_DEFAULT_MONTHLY_CREDITS).toBe(4_900);
  });

  it('builds one reference per seat and due date', () => {
    expect(
      lifetimeGrantReferenceId('seat_1', new Date('2026-12-13T20:00:00.000Z')),
    ).toBe('seat_1:2026-12-13T20:00:00.000Z');
  });
});
