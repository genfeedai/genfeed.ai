import type { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import type { ServerPrisma } from '@api/server.dependencies';
import { PAID_CREATIVE_RESEARCH_SOURCES } from '@genfeedai/integrations/ads';
import { AdPerformanceService } from './ad-performance.service';

const NOW = new Date('2026-08-01T00:00:00.000Z');
const TENANT_RESEARCH_SOURCES = [...PAID_CREATIVE_RESEARCH_SOURCES];

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
  const upsert = vi.fn();
  const update = vi.fn();

  const prisma = {
    adPerformance: { findFirst, findMany, update, upsert },
  } as unknown as ServerPrisma;

  let service: AdPerformanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdPerformanceService(prisma);
    findMany.mockResolvedValue([]);
    findFirst.mockResolvedValue(null);
    upsert.mockImplementation(async ({ create }) =>
      makeRow(create.data, create),
    );
    update.mockImplementation(async ({ data }) => makeRow(data.data, data));
  });

  describe('upsert', () => {
    it('upserts on the organization + identityKey unique without a corpus read', async () => {
      const result = await service.upsert({
        adPlatform: 'meta',
        brandId: 'brand-1',
        credentialId: 'cred-1',
        date: '2026-07-01T00:00:00.000Z',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(findMany).not.toHaveBeenCalled();
      expect(upsert).toHaveBeenCalledTimes(1);

      const call = upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        organizationId: 'org-1',
        organizationId_identityKey: {
          identityKey: 'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||',
          organizationId: 'org-1',
        },
      });
      expect(call.where).not.toHaveProperty('isDeleted');
      expect(call.create.organizationId).toBe('org-1');
      expect(call.create.brandId).toBe('brand-1');
      expect(call.create.credentialId).toBe('cred-1');
      expect(call.create.date).toEqual(new Date('2026-07-01T00:00:00.000Z'));
      expect(call.create.externalAccountId).toBe('acct-1');
      expect(call.create.granularity).toBe('account');
      expect(call.create.identityKey).toBe(
        'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||',
      );
      expect(call.create.isDeleted).toBe(false);
      expect(call.update).toEqual(call.create);
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

      const persisted = upsert.mock.calls[0][0].create.data;
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
      expect(upsert).not.toHaveBeenCalled();
    });

    it('uses the same identityKey for equivalent date spellings', async () => {
      await service.upsert({
        adPlatform: 'meta',
        date: new Date('2026-07-01T00:00:00.000Z'),
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).toBe('v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||');
    });

    it('does not match a record from a different account', async () => {
      await service.upsert({
        adPlatform: 'meta',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).toContain('|acct-1|');
      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).not.toContain('|other-acct|');
    });

    it('includes the campaign id in the key for campaign granularity', async () => {
      await service.upsert({
        externalAccountId: 'acct-1',
        externalCampaignId: 'camp-1',
        granularity: 'campaign',
        organizationId: 'org-1',
      });

      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).toBe('v1|||campaign|acct-1|camp-1||');
    });

    it('falls back to externalAdGroupId for adset granularity', async () => {
      await service.upsert({
        externalAccountId: 'acct-1',
        externalAdGroupId: 'group-1',
        granularity: 'adset',
        organizationId: 'org-1',
      });

      expect(upsert.mock.calls[0][0].create.externalAdSetId).toBe('group-1');
      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).toBe('v1|||adset|acct-1||group-1|');
    });

    it('includes the ad id in the key for ad granularity', async () => {
      await service.upsert({
        externalAccountId: 'acct-1',
        externalAdId: 'ad-1',
        granularity: 'ad',
        organizationId: 'org-1',
      });

      expect(
        upsert.mock.calls[0][0].where.organizationId_identityKey.identityKey,
      ).toBe('v1|||ad|acct-1|||ad-1');
    });

    it('defaults brand and credential ids to null when absent', async () => {
      await service.upsert({
        granularity: 'account',
        organizationId: 'org-1',
      });

      const created = upsert.mock.calls[0][0].create;
      expect(created.brandId).toBeNull();
      expect(created.credentialId).toBeNull();
    });

    it('matches a soft-deleted identityKey and restores it instead of creating', async () => {
      const identityKey = 'v1|meta|2026-07-01T00:00:00.000Z|account|acct-1|||';
      const existing = makeRow(
        {},
        {
          id: 'perf-tombstone',
          identityKey,
          isDeleted: true,
          organizationId: 'org-1',
        },
      );
      let created = false;
      let updated = false;

      upsert.mockImplementation(
        async (args: {
          create: { data: Record<string, unknown>; isDeleted: boolean };
          update: { data: Record<string, unknown>; isDeleted: boolean };
          where: {
            isDeleted?: boolean;
            organizationId?: string;
            organizationId_identityKey?: {
              identityKey: string;
              organizationId: string;
            };
          };
        }) => {
          const unique = args.where.organizationId_identityKey;
          const uniqueMatches =
            unique?.identityKey === existing.identityKey &&
            unique?.organizationId === existing.organizationId &&
            (args.where.organizationId === undefined ||
              args.where.organizationId === existing.organizationId);
          const softDeleteFilterBlocks =
            args.where.isDeleted !== undefined &&
            args.where.isDeleted !== existing.isDeleted;

          if (uniqueMatches && !softDeleteFilterBlocks) {
            updated = true;
            return makeRow(args.update.data, {
              ...existing,
              isDeleted: args.update.isDeleted,
            });
          }

          if (uniqueMatches) {
            throw new Error(
              'Unique constraint failed on the fields: (`organizationId`,`identityKey`)',
            );
          }

          created = true;
          return makeRow(args.create.data, {
            isDeleted: args.create.isDeleted,
          });
        },
      );

      const result = await service.upsert({
        adPlatform: 'meta',
        date: '2026-07-01T00:00:00.000Z',
        externalAccountId: 'acct-1',
        granularity: 'account',
        organizationId: 'org-1',
      });

      const call = upsert.mock.calls[0][0];
      expect(call.where).toEqual({
        organizationId: 'org-1',
        organizationId_identityKey: {
          identityKey,
          organizationId: 'org-1',
        },
      });
      expect(call.where).not.toHaveProperty('isDeleted');
      expect(call.update.isDeleted).toBe(false);
      expect(call.create.isDeleted).toBe(false);
      expect(updated).toBe(true);
      expect(created).toBe(false);
      expect(result.id).toBe('perf-tombstone');
      expect(result.isDeleted).toBe(false);
    });
  });

  describe('upsertBatch', () => {
    it('returns the number of records processed', async () => {
      const count = await service.upsertBatch([
        { granularity: 'account', organizationId: 'org-1' },
        { granularity: 'campaign', organizationId: 'org-1' },
      ]);

      expect(count).toBe(2);
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns zero for an empty batch', async () => {
      await expect(service.upsertBatch([])).resolves.toBe(0);
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe('findByOrganization', () => {
    it('filters, sorts, and paginates in Prisma instead of memory', async () => {
      findMany.mockResolvedValueOnce([
        makeRow({ adPlatform: 'google' }, { id: 'b' }),
      ]);

      const startDate = new Date('2026-07-02');
      const endDate = new Date('2026-07-06');
      const result = await service.findByOrganization('org-1', {
        adPlatform: 'google',
        endDate,
        granularity: 'day',
        limit: 1,
        offset: 1,
        startDate,
      });

      expect(findMany).toHaveBeenCalledWith({
        orderBy: { date: { nulls: 'last', sort: 'desc' } },
        skip: 1,
        take: 1,
        where: {
          adPlatform: 'google',
          date: { gte: startDate, lte: endDate },
          granularity: 'day',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(result.map((row) => row.id)).toEqual(['b']);
    });

    it('scopes the read to the organization and soft-delete flag', async () => {
      await service.findByOrganization('org-1', {});

      expect(findMany).toHaveBeenCalledWith({
        orderBy: { date: { nulls: 'last', sort: 'desc' } },
        skip: 0,
        take: 50,
        where: {
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('filters by ad platform in SQL', async () => {
      await service.findByOrganization('org-1', {
        adPlatform: 'meta',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ adPlatform: 'meta' }),
        }),
      );
    });

    it('filters by granularity in SQL', async () => {
      await service.findByOrganization('org-1', {
        granularity: 'week',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ granularity: 'week' }),
        }),
      );
    });

    it('filters by start and end date in SQL', async () => {
      const startDate = new Date('2026-07-02');
      const endDate = new Date('2026-07-06');

      await service.findByOrganization('org-1', { endDate, startDate });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: startDate, lte: endDate },
          }),
        }),
      );
    });

    it('excludes records with no usable date when a range is requested', async () => {
      const startDate = new Date('2026-01-01');

      await service.findByOrganization('org-1', { startDate });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: startDate },
          }),
        }),
      );
    });

    it('applies offset and limit in SQL', async () => {
      await service.findByOrganization('org-1', {
        limit: 1,
        offset: 1,
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 1, take: 1 }),
      );
    });

    it('defaults to a page size of 50', async () => {
      await service.findByOrganization('org-1', {});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
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
        orderBy: [
          { performanceScore: { nulls: 'last', sort: 'desc' } },
          { updatedAt: 'desc' },
        ],
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
          orderBy: [
            { performanceScore: { nulls: 'last', sort: 'desc' } },
            { updatedAt: 'desc' },
          ],
          take: 500,
        }),
      );
      expect(result.map((r) => r.id)).toEqual(['high', 'low']);
    });
  });

  describe('findById', () => {
    it('returns null when the record does not exist', async () => {
      await expect(service.findById('missing', 'org-1')).resolves.toBeNull();
    });

    it('excludes soft-deleted records', async () => {
      await service.findById('perf-1', 'org-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'perf-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
    });

    it('flattens the JSON payload onto the returned document', async () => {
      findFirst.mockResolvedValueOnce(makeRow({ ctr: 0.05 }));

      const result = await service.findById('perf-1', 'org-1');

      expect(result?.ctr).toBe(0.05);
      expect(result?.id).toBe('perf-1');
    });
  });

  describe('findPublicById', () => {
    it('restricts the lookup to public scope', async () => {
      await service.findPublicById('perf-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: 'perf-1',
          isDeleted: false,
          OR: [
            { researchSource: null },
            { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
          ],
          scope: 'public',
        },
      });
    });

    it('returns null for a non-public record', async () => {
      await expect(service.findPublicById('perf-1')).resolves.toBeNull();
    });
  });

  describe('findLatestSyncDateForCredential', () => {
    it('returns null when the credential has no dated rows', async () => {
      await expect(
        service.findLatestSyncDateForCredential('cred-1'),
      ).resolves.toBeNull();
    });

    it('returns the newest scalar date from Prisma', async () => {
      findFirst.mockResolvedValueOnce({
        date: new Date('2026-07-20T00:00:00.000Z'),
      });

      await expect(
        service.findLatestSyncDateForCredential('cred-1'),
      ).resolves.toEqual(new Date('2026-07-20T00:00:00.000Z'));
    });

    it('scopes the lookup to the credential and excludes null dates and soft deletes', async () => {
      await service.findLatestSyncDateForCredential('cred-1');

      expect(findFirst).toHaveBeenCalledWith({
        orderBy: { date: { sort: 'desc' } },
        select: { date: true },
        where: {
          credentialId: 'cred-1',
          date: { not: null },
          isDeleted: false,
        },
      });
      expect(findMany).not.toHaveBeenCalled();
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
        where: { id: 'a', isDeleted: false, organizationId: 'org-1' },
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
