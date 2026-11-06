import {
  type CreatePatternDto,
  PatternStoreService,
} from '@api/collections/content-intelligence/services/pattern-store.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentIntelligencePlatform,
  ContentPatternType,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  assertTenantScopedQuery,
  TenantIsolationError,
} from '@libs/prisma/tenant-guard';
import { beforeEach, describe, expect, it } from 'vitest';

interface PatternRow {
  createdAt: Date;
  data: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  sourceCreatorId?: string;
}

interface DataFilter {
  data: {
    array_contains?: unknown[];
    equals?: unknown;
    gte?: number;
    path: string[];
  };
}

interface PatternWhere {
  AND?: DataFilter[];
  id?: string;
  isDeleted?: boolean;
  organizationId?: string;
  sourceCreatorId?: string;
}

const ORG = 'org-123';
const CREATOR = 'creator-1';

const pattern = (
  rawExample: string,
  fields: Partial<CreatePatternDto> = {},
): CreatePatternDto => ({
  extractedFormula: 'formula',
  organizationId: ORG,
  patternType: ContentPatternType.HOOK,
  placeholders: [],
  platform: ContentIntelligencePlatform.INSTAGRAM,
  rawExample,
  sourceCreatorId: CREATOR,
  sourceMetrics: {
    comments: 0,
    engagementRate: 0,
    likes: 0,
    shares: 0,
    views: 0,
    viralScore: 0,
  },
  tags: [],
  ...fields,
});

const readPath = (data: Record<string, unknown>, path: string[]) =>
  path.reduce<unknown>(
    (value, key) => (value as Record<string, unknown> | undefined)?.[key],
    data,
  );

const matchesData = (data: Record<string, unknown>, filter: DataFilter) => {
  const value = readPath(data, filter.data.path);
  if (filter.data.equals !== undefined) return value === filter.data.equals;
  if (filter.data.gte !== undefined) return Number(value) >= filter.data.gte;
  return (filter.data.array_contains ?? []).every(
    (item) => Array.isArray(value) && value.includes(item),
  );
};

describe('PatternStoreService', () => {
  let rows: PatternRow[];
  let isCloudGuardOn: boolean;
  let service: PatternStoreService;

  const live = () => rows.filter((row) => !row.isDeleted);
  const examplesOf = (documents: { rawExample?: unknown }[]) =>
    documents.map((document) => document.rawExample);

  beforeEach(() => {
    rows = [];
    isCloudGuardOn = false;

    // The cloud tenant guard checks every query against the request tenant.
    const guard = (operation: string, args: unknown) => {
      if (isCloudGuardOn) {
        assertTenantScopedQuery({
          args,
          isCloud: true,
          model: 'ContentPattern',
          operation,
          tenantModelNames: new Set(['ContentPattern']),
        });
      }
    };
    const matches = (row: PatternRow, where: PatternWhere) =>
      (where.id === undefined || row.id === where.id) &&
      (where.organizationId === undefined ||
        row.organizationId === where.organizationId) &&
      (where.isDeleted === undefined || row.isDeleted === where.isDeleted) &&
      (where.sourceCreatorId === undefined ||
        row.sourceCreatorId === where.sourceCreatorId) &&
      (where.AND ?? []).every((filter) => matchesData(row.data, filter));
    const contentPattern = {
      create: async ({
        data,
      }: {
        data: Omit<PatternRow, 'createdAt' | 'id' | 'isDeleted'>;
      }) => {
        const row: PatternRow = {
          createdAt: new Date(Date.UTC(2026, 0, rows.length + 1)),
          id: `pattern-${rows.length + 1}`,
          isDeleted: false,
          ...data,
        };
        rows.push(row);
        return { ...row };
      },
      findFirst: async (args: { where: PatternWhere }) => {
        guard('findFirst', args);
        return rows.find((row) => matches(row, args.where)) ?? null;
      },
      findMany: async (args: { take?: number; where: PatternWhere }) => {
        guard('findMany', args);
        return rows
          .filter((row) => matches(row, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take);
      },
      update: async (args: {
        data: Partial<PatternRow>;
        where: PatternWhere;
      }) => {
        guard('update', args);
        const row = rows.find((candidate) => matches(candidate, args.where));
        return row ? Object.assign(row, args.data) : null;
      },
      updateMany: async (args: {
        data: Partial<PatternRow>;
        where: PatternWhere;
      }) => {
        guard('updateMany', args);
        const matched = rows.filter((row) => matches(row, args.where));
        for (const row of matched) {
          Object.assign(row, args.data);
        }
        return { count: matched.length };
      },
    };
    const logger = {
      debug: () => undefined,
      error: () => undefined,
      log: () => undefined,
      warn: () => undefined,
    } as unknown as LoggerService;

    service = new PatternStoreService(
      { contentPattern } as unknown as PrismaService,
      logger,
    );
  });

  it('stores ownership as columns and the pattern as JSON data', async () => {
    const stored = await service.storePattern(
      pattern('example', { sourcePostDate: new Date('2026-02-03T04:05:06Z') }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          patternType: ContentPatternType.HOOK,
          rawExample: 'example',
          relevanceWeight: 1,
          sourcePostDate: '2026-02-03T04:05:06.000Z',
          usageCount: 0,
        }),
        organizationId: ORG,
        sourceCreatorId: CREATOR,
      }),
    ]);
    expect(rows[0]?.data).not.toHaveProperty('organizationId');
    expect(stored).toMatchObject({ rawExample: 'example', usageCount: 0 });
  });

  it('stores every pattern of a bulk import', async () => {
    const stored = await service.storeBulkPatterns([
      pattern('a'),
      pattern('b'),
      pattern('c'),
    ]);

    expect(examplesOf(stored)).toEqual(['a', 'b', 'c']);
    expect(rows).toHaveLength(3);
  });

  it('lists the creator patterns of the organization only', async () => {
    await service.storeBulkPatterns([
      pattern('mine'),
      pattern('other creator', { sourceCreatorId: 'creator-2' }),
      pattern('other org', { organizationId: 'org-other' }),
    ]);

    await expect(service.findByCreator(CREATOR, ORG)).resolves.toEqual([
      expect.objectContaining({ rawExample: 'mine' }),
    ]);
    await expect(service.findByCreator(CREATOR, 'org-x')).resolves.toEqual([]);
  });

  it.each([
    [{}, ['newest', 'tiktok', 'hooked', 'oldest']],
    [{ limit: 2 }, ['newest', 'tiktok']],
    [{ platform: ContentIntelligencePlatform.TIKTOK }, ['tiktok']],
    [
      { patternType: ContentPatternType.HOOK, minEngagementRate: 2 },
      ['hooked'],
    ],
    [{ tags: ['growth'] }, ['newest']],
    [{ sourceCreator: 'creator-2' }, ['oldest']],
  ])(
    'filters organization patterns by JSON fields (%o)',
    async (filters, expected) => {
      await service.storePattern(
        pattern('oldest', {
          patternType: ContentPatternType.CTA,
          sourceCreatorId: 'creator-2',
        }),
      );
      await service.storePattern(
        pattern('hooked', {
          sourceMetrics: { ...pattern('').sourceMetrics, engagementRate: 3 },
        }),
      );
      await service.storePattern(
        pattern('tiktok', {
          patternType: ContentPatternType.CTA,
          platform: ContentIntelligencePlatform.TIKTOK,
        }),
      );
      await service.storePattern(
        pattern('newest', {
          patternType: ContentPatternType.CTA,
          tags: ['growth', 'b2b'],
        }),
      );
      await service.storePattern(
        pattern('foreign', { organizationId: 'org-x' }),
      );

      const found = await service.findByOrganization(ORG, filters);

      expect(examplesOf(found)).toEqual(expected);
    },
  );

  it('counts a use of a pattern under the cloud tenant guard', async () => {
    await service.storePattern(pattern('example'));
    isCloudGuardOn = true;

    await runWithTenantContext({ organizationId: ORG }, () =>
      service.incrementUsage('pattern-1', ORG),
    );
    await runWithTenantContext({ organizationId: ORG }, () =>
      service.incrementUsage('pattern-1', ORG),
    );

    expect(rows[0]?.data.usageCount).toBe(2);
  });

  it('refuses to count a use for an organization other than the request tenant', async () => {
    await service.storePattern(pattern('example'));
    isCloudGuardOn = true;

    await expect(
      runWithTenantContext({ organizationId: 'org-other' }, () =>
        service.incrementUsage('pattern-1', ORG),
      ),
    ).rejects.toBeInstanceOf(TenantIsolationError);
    expect(rows[0]?.data.usageCount).toBe(0);
  });

  it('counts nothing for a pattern of another organization', async () => {
    await service.storePattern(pattern('example', { organizationId: 'org-x' }));

    await service.incrementUsage('pattern-1', ORG);

    expect(rows[0]?.data.usageCount).toBe(0);
  });

  it('soft-deletes the creator patterns of the organization only', async () => {
    await service.storeBulkPatterns([
      pattern('a'),
      pattern('b'),
      pattern('other creator', { sourceCreatorId: 'creator-2' }),
      pattern('other org', { organizationId: 'org-x' }),
    ]);

    await expect(service.deleteByCreator(CREATOR, ORG)).resolves.toEqual({
      count: 2,
    });
    expect(live().map((row) => row.data.rawExample)).toEqual([
      'other creator',
      'other org',
    ]);
  });
});
