import {
  Analytic,
  AnalyticSchema,
} from '@api/endpoints/analytics/schemas/analytic.schema';

describe('AnalyticSchema', () => {
  it('should be defined', () => {
    expect(AnalyticSchema).toBeDefined();
  });

  it('should allow creating an Analytic instance with totals', () => {
    const analytic = new Analytic();
    analytic.totalClaimed = 5;
    analytic.totalHoursWatched = 10;

    expect(analytic.totalClaimed).toBe(5);
    expect(analytic.totalHoursWatched).toBe(10);
  });
});
