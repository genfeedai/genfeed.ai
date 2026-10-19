import {
  analyticsAccountPeriodSeriesSql,
  analyticsAccountTopPostsSql,
  analyticsPeriodSeriesSql,
  analyticsPeriodTotalsSql,
} from '@api/endpoints/analytics/analytics-period-sql';
import { Prisma } from '@genfeedai/prisma';

describe('active daily analytics SQL', () => {
  const dates = {
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
  };
  it.each([analyticsPeriodTotalsSql, analyticsPeriodSeriesSql])(
    'excludes deleted observations before calculating period deltas',
    (builder) => {
      const query = builder({
        ...dates,
        brandFilter: Prisma.sql`AND "brandId" = ${'brand'}`,
        orgFilter: Prisma.sql`AND "organizationId" = ${'org'}`,
      });
      expect(query.sql).toContain('WHERE "isDeleted" = false');
      expect(query.values).toContain('org');
    },
  );
  it.each([analyticsPeriodTotalsSql, analyticsPeriodSeriesSql])(
    'reads the window plus one pre-window baseline row, not the whole history',
    (builder) => {
      const query = builder({
        ...dates,
        brandFilter: Prisma.sql``,
        orgFilter: Prisma.sql`AND "organizationId" = ${'org'}`,
      });
      expect(query.sql).toContain('WITH in_window AS');
      expect(query.sql).toContain('CROSS JOIN LATERAL');
      expect(query.sql).toContain('ORDER BY "date" DESC');
      expect(query.sql).toContain('LIMIT 1');
      // Window start bounds the in-window arm and the baseline arm.
      expect(
        query.values.filter((value) => value === dates.startDate),
      ).toHaveLength(3);
      // Tenant filter applies to both arms.
      expect(query.values.filter((value) => value === 'org')).toHaveLength(2);
    },
  );
  it('excludes deleted observations from credential history', () => {
    const query = analyticsAccountPeriodSeriesSql({
      ...dates,
      credentialId: 'credential',
      organizationId: 'org',
    });
    expect(query.sql).toContain('WHERE pa."isDeleted" = false');
    expect(query.values).toContain('org');
  });
  it('excludes deleted latest observations from account top posts', () => {
    const query = analyticsAccountTopPostsSql({
      ...dates,
      credentialId: 'credential',
      organizationId: 'org',
      limit: 20,
    });
    expect(query.sql).toContain('WHERE "isDeleted" = false');
    expect(query.values).toContain('org');
  });
});
