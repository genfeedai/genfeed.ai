import type { AdPerformance } from '@server/collections/ad-performance/schemas/ad-performance.schema';
import type { ServerPrisma } from '@server/server.dependencies';
import { AdPerformanceService } from './ad-performance.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');

function makeRow(
  data: Record<string, unknown> = {},
  overrides: Partial<AdPerformance> = {},
): AdPerformance {
  return {
    brandId: 'brand-1',
    createdAt: NOW,
    credentialId: 'cred-1',
    data: data as AdPerformance['data'],
    id: 'perf-1',
    isDeleted: false,
    organizationId: 'org-1',
    updatedAt: NOW,
    ...overrides,
  } as AdPerformance;
}

describe('AdPerformanceService', () => {
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const update = vi.fn();

  const prisma = {
    adPerformance: { create, findFirst, findMany, update },
  } as unknown as ServerPrisma;

  let service: AdPerformanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdPerformanceService(prisma);
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => makeRow(data.data, data));
    update.mockImplementation(async ({ data }) => makeRow(data.data, data));
  });

  describe('upsert', () => {
    it('creates a new row when no matching record exists', async () => {
      const result = await service.upsert({
        adPlatform: 'meta',
        brandId: 'brand-1',
        credentialId: 'cred-1',
        date: '2026-07-01T00:00:00.000Z',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalledTimes(1);
      expect(update).not.toHaveBeenCalled();

      const created = create.mock.calls[0][0].data;
      expect(created.organizationId).toBe('org-1');
      expect(created.brandId).toBe('brand-1');
      expect(created.credentialId).toBe('cred-1');
      expect(result.adPlatform).toBe('meta');
    });

    it('strips identity keys out of the persisted JSON payload', async () => {
      await service.upsert({
        adPlatform: 'meta',
        brand: 'legacy-brand',
        brandId: 'brand-1',
        credential: 'legacy-cred',
        credentialId: 'cred-1',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organization: 'legacy-org',
        organizationId: 'org-1',
      });

      const persisted = create.mock.calls[0][0].data.data;
      expect(persisted).not.toHaveProperty('organizationId');
      expect(persisted).not.toHaveProperty('brandId');
      expect(persisted).not.toHaveProperty('credentialId');
      expect(persisted).not.toHaveProperty('organization');
      expect(persisted).not.toHaveProperty('brand');
      expect(persisted).not.toHaveProperty('credential');
      expect(persisted.adPlatform).toBe('meta');
    });

    it('rejects a payload without an organization id', async () => {
      await expect(
        service.upsert({ adPlatform: 'meta', granularity: 'account' }),
      ).rejects.toThrow('AdPerformance organizationId is required');
    });

    it('scopes the existing-record lookup to the organization', async () => {
      await service.upsert({
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('updates the matching record instead of creating a duplicate', async () => {
      findMany.mockResolvedValueOnce([
        makeRow(
          {
            adPlatform: 'meta',
            date: '2026-07-01T00:00:00.000Z',
            externalAccountId: 'acct-1',
            granularity: 'account',
          },
          { id: 'existing-1' },
        ),
      ]);

      await service.upsert({
        adPlatform: 'meta',
        date: '2026-07-01T00:00:00.000Z',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'existing-1' } }),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('treats an equivalent date expressed differently as the same key', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({
          adPlatform: 'meta',
          date: new Date('2026-07-01T00:00:00.000Z'),
          externalAccountId: 'acct-1',
          granularity: 'account',
        }),
      ]);

      await service.upsert({
        adPlatform: 'meta',
        date: '2026-07-01T00:00:00.000Z',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(update).toHaveBeenCalled();
    });

    it('does not match a record from a different account', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({
          adPlatform: 'meta',
          externalAccountId: 'other-acct',
          granularity: 'account',
        }),
      ]);

      await service.upsert({
        adPlatform: 'meta',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalled();
    });

    it('includes the campaign id in the key for campaign granularity', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({
          externalAccountId: 'acct-1',
          externalCampaignId: 'camp-other',
          granularity: 'campaign',
        }),
      ]);

      await service.upsert({
        externalAccountId: 'acct-1',
        externalCampaignId: 'camp-1',
        granularity: 'campaign',
        organizationId: 'org-1',
      });

      expect(create).toHaveBeenCalled();
    });

    it('falls back to externalAdGroupId for adset granularity', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({
          externalAccountId: 'acct-1',
          externalAdSetId: 'group-1',
          granularity: 'adset',
        }),
      ]);

      await service.upsert({
        externalAccountId: 'acct-1',
        externalAdGroupId: 'group-1',
        granularity: 'adset',
        organizationId: 'org-1',
      });

      expect(update).toHaveBeenCalled();
    });

    it('includes the ad id in the key for ad granularity', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({
          externalAccountId: 'acct-1',
          externalAdId: 'ad-1',
          granularity: 'ad',
        }),
      ]);

      await service.upsert({
        externalAccountId: 'acct-1',
        externalAdId: 'ad-1',
        granularity: 'ad',
        organizationId: 'org-1',
      });

      expect(update).toHaveBeenCalled();
    });

    it('defaults brand and credential ids to null when absent', async () => {
      await service.upsert({
        granularity: 'account',
        organizationId: 'org-1',
      });

      const created = create.mock.calls[0][0].data;
      expect(created.brandId).toBeNull();
      expect(created.credentialId).toBeNull();
    });
  });

  describe('upsertBatch', () => {
    it('returns the number of records processed', async () => {
      const count = await service.upsertBatch([
        { granularity: 'account', organizationId: 'org-1' },
        { granularity: 'account', organizationId: 'org-1' },
      ]);

      expect(count).toBe(2);
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('returns zero for an empty batch', async () => {
      await expect(service.upsertBatch([])).resolves.toBe(0);
    });
  });

  describe('findByOrganization', () => {
    const rows = [
      makeRow(
        { adPlatform: 'meta', date: '2026-07-01', granularity: 'day' },
        { id: 'a' },
      ),
      makeRow(
        { adPlatform: 'google', date: '2026-07-05', granularity: 'day' },
        { id: 'b' },
      ),
      makeRow(
        { adPlatform: 'meta', date: '2026-07-10', granularity: 'week' },
        { id: 'c' },
      ),
    ];

    it('scopes the read to the organization and soft-delete flag', async () => {
      await service.findByOrganization('org-1', {});

      expect(findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('sorts results newest first', async () => {
      findMany.mockResolvedValueOnce(rows);

      const result = await service.findByOrganization('org-1', {});

      expect(result.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    });

    it('filters by ad platform', async () => {
      findMany.mockResolvedValueOnce(rows);

      const result = await service.findByOrganization('org-1', {
        adPlatform: 'meta',
      });

      expect(result.map((r) => r.id)).toEqual(['c', 'a']);
    });

    it('filters by granularity', async () => {
      findMany.mockResolvedValueOnce(rows);

      const result = await service.findByOrganization('org-1', {
        granularity: 'week',
      });

      expect(result.map((r) => r.id)).toEqual(['c']);
    });

    it('filters by start and end date', async () => {
      findMany.mockResolvedValueOnce(rows);

      const result = await service.findByOrganization('org-1', {
        endDate: new Date('2026-07-06'),
        startDate: new Date('2026-07-02'),
      });

      expect(result.map((r) => r.id)).toEqual(['b']);
    });

    it('excludes records with no usable date when a range is requested', async () => {
      findMany.mockResolvedValueOnce([makeRow({ date: null }, { id: 'x' })]);

      const result = await service.findByOrganization('org-1', {
        startDate: new Date('2026-01-01'),
      });

      expect(result).toEqual([]);
    });

    it('applies offset and limit', async () => {
      findMany.mockResolvedValueOnce(rows);

      const result = await service.findByOrganization('org-1', {
        limit: 1,
        offset: 1,
      });

      expect(result.map((r) => r.id)).toEqual(['b']);
    });

    it('defaults to a page size of 50', async () => {
      findMany.mockResolvedValueOnce(
        Array.from({ length: 60 }, (_, i) =>
          makeRow({ date: `2026-07-01` }, { id: `row-${i}` }),
        ),
      );

      const result = await service.findByOrganization('org-1', {});

      expect(result).toHaveLength(50);
    });
  });

  describe('findTopPerformers', () => {
    it('returns nothing for an explicit non-positive limit', async () => {
      await expect(service.findTopPerformers({ limit: 0 })).resolves.toEqual(
        [],
      );
      await expect(service.findTopPerformers({ limit: -5 })).resolves.toEqual(
        [],
      );
      expect(findMany).not.toHaveBeenCalled();
    });

    it('orders by performanceScore by default and excludes null scores', async () => {
      await service.findTopPerformers({});

      expect(findMany).toHaveBeenCalledWith({
        orderBy: [{ performanceScore: 'desc' }, { updatedAt: 'desc' }],
        take: 10,
        where: expect.objectContaining({
          isDeleted: false,
          performanceScore: { not: null },
        }),
      });
    });

    it('orders by any supported scalar metric', async () => {
      await service.findTopPerformers({ metric: 'roas' });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ roas: 'desc' }, { updatedAt: 'desc' }],
          where: expect.objectContaining({ roas: { not: null } }),
        }),
      );
    });

    it('applies platform, industry and scope filters', async () => {
      await service.findTopPerformers({
        adPlatform: 'meta',
        industry: 'saas',
        scope: 'public',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            adPlatform: 'meta',
            industry: 'saas',
            scope: 'public',
          }),
        }),
      );
    });

    it('clamps the limit to the supported maximum', async () => {
      await service.findTopPerformers({ limit: 5000 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('truncates a fractional limit', async () => {
      await service.findTopPerformers({ limit: 7.9 });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 7 }),
      );
    });

    it('falls back to the default limit for a non-finite value', async () => {
      await service.findTopPerformers({ limit: Number.NaN });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });

    it('sorts JSON-backed metrics in memory over a bounded candidate set', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({ conversions: 5 }, { id: 'low' }),
        makeRow({ conversions: 50 }, { id: 'high' }),
        makeRow({}, { id: 'none' }),
      ]);

      const result = await service.findTopPerformers({
        limit: 2,
        metric: 'conversions',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ performanceScore: 'desc' }, { updatedAt: 'desc' }],
          take: 500,
        }),
      );
      expect(result.map((r) => r.id)).toEqual(['high', 'low']);
    });
  });

  describe('findById', () => {
    it('returns null when the record does not exist', async () => {
      await expect(service.findById('missing')).resolves.toBeNull();
    });

    it('excludes soft-deleted records', async () => {
      await service.findById('perf-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'perf-1', isDeleted: false },
      });
    });

    it('flattens the JSON payload onto the returned document', async () => {
      findFirst.mockResolvedValueOnce(makeRow({ ctr: 0.05 }));

      const result = await service.findById('perf-1');

      expect(result?.ctr).toBe(0.05);
      expect(result?.id).toBe('perf-1');
    });
  });

  describe('findPublicById', () => {
    it('restricts the lookup to public scope', async () => {
      await service.findPublicById('perf-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'perf-1', isDeleted: false, scope: 'public' },
      });
    });

    it('returns null for a non-public record', async () => {
      await expect(service.findPublicById('perf-1')).resolves.toBeNull();
    });
  });

  describe('findLatestSyncDateForCredential', () => {
    it('returns null when the credential has no rows', async () => {
      await expect(
        service.findLatestSyncDateForCredential('cred-1'),
      ).resolves.toBeNull();
    });

    it('returns the newest date across the credential slice', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({ date: '2026-07-01T00:00:00.000Z' }),
        makeRow({ date: '2026-07-20T00:00:00.000Z' }),
        makeRow({ date: '2026-07-10T00:00:00.000Z' }),
      ]);

      await expect(
        service.findLatestSyncDateForCredential('cred-1'),
      ).resolves.toEqual(new Date('2026-07-20T00:00:00.000Z'));
    });

    it('ignores rows with a missing or unparseable date', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({ date: 'not-a-date' }),
        makeRow({}),
      ]);

      await expect(
        service.findLatestSyncDateForCredential('cred-1'),
      ).resolves.toBeNull();
    });

    it('scopes the lookup to the credential and excludes soft deletes', async () => {
      await service.findLatestSyncDateForCredential('cred-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { credentialId: 'cred-1', isDeleted: false },
      });
    });
  });

  describe('removeOrgFromAggregation', () => {
    it('returns zero when the organization has no rows', async () => {
      await expect(service.removeOrgFromAggregation('org-1')).resolves.toBe(0);
      expect(update).not.toHaveBeenCalled();
    });

    it('rewrites every row to organization scope in both column and JSON', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({ ctr: 0.1, scope: 'public' }, { id: 'a' }),
        makeRow({ scope: 'public' }, { id: 'b' }),
      ]);

      const count = await service.removeOrgFromAggregation('org-1');

      expect(count).toBe(2);
      expect(update).toHaveBeenCalledTimes(2);
      expect(update).toHaveBeenCalledWith({
        data: {
          data: { ctr: 0.1, scope: 'organization' },
          scope: 'organization',
        },
        where: { id: 'a' },
      });
    });

    it('reads every row for the organization including soft-deleted ones', async () => {
      await service.removeOrgFromAggregation('org-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
      });
    });
  });
});
