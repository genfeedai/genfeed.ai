import { describe, expect, it } from 'vitest';
import { completedEmailPeriod } from './lifecycle-email-period.util';

describe('completedEmailPeriod', () => {
  it('uses the previous complete Monday to Monday week across year boundaries', () => {
    expect(
      completedEmailPeriod(new Date('2027-01-03T23:59:59Z'), true),
    ).toEqual({
      start: new Date('2026-12-21T00:00:00Z'),
      end: new Date('2026-12-28T00:00:00Z'),
    });
    expect(
      completedEmailPeriod(new Date('2027-01-04T00:00:00Z'), true),
    ).toEqual({
      start: new Date('2026-12-28T00:00:00Z'),
      end: new Date('2027-01-04T00:00:00Z'),
    });
  });
  it('uses the previous complete UTC day', () => {
    expect(
      completedEmailPeriod(new Date('2026-09-09T08:00:00Z'), false),
    ).toEqual({
      start: new Date('2026-09-08T00:00:00Z'),
      end: new Date('2026-09-09T00:00:00Z'),
    });
  });
});
