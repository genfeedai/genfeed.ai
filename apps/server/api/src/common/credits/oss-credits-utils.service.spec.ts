import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';

describe('OssCreditsUtilsService', () => {
  let service: OssCreditsUtilsService;

  beforeEach(() => {
    service = new OssCreditsUtilsService();
  });

  it('allows credit checks with unlimited self-hosted semantics', async () => {
    await expect(
      service.checkOrganizationCreditsAvailable('org-1', 1_000_000),
    ).resolves.toBe(true);
    await expect(service.getOrganizationCreditsBalance('org-1')).resolves.toBe(
      Number.POSITIVE_INFINITY,
    );
    await expect(
      service.getOrganizationCreditsWithExpiration('org-1'),
    ).resolves.toEqual({
      credits: [],
      total: Number.POSITIVE_INFINITY,
    });
  });

  it('keeps mutation methods as contract-compatible no-ops', async () => {
    const expiresAt = new Date('2026-01-01T00:00:00.000Z');

    await expect(
      service.deductCreditsFromOrganization(
        'org-1',
        'user-1',
        42,
        'test debit',
        undefined,
        { maxOverdraftCredits: 5 },
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.addOrganizationCreditsWithExpiration(
        'org-1',
        10,
        'seed',
        'test add',
        expiresAt,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.refundOrganizationCredits(
        'org-1',
        10,
        'refund',
        'test refund',
        expiresAt,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.resetOrganizationCredits('org-1', 100, 'reset', 'test reset'),
    ).resolves.toBeUndefined();
    await expect(
      service.removeAllOrganizationCredits('org-1', 'reset', 'test remove'),
    ).resolves.toBeUndefined();
  });

  it('returns stable dashboard cycle metrics', async () => {
    await expect(
      service.getCycleRemainingMetrics(
        'org-1',
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-02-01T00:00:00.000Z'),
        Number.POSITIVE_INFINITY,
      ),
    ).resolves.toEqual({
      cycleTotal: 0,
      remainingPercent: 100,
    });
  });
});
