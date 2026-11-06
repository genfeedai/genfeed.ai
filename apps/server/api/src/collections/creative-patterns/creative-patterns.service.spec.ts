import { CreativePatternsService } from '@api/collections/creative-patterns/creative-patterns.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface PatternRow {
  brandId: string | null;
  data: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  updatedAt: Date;
}

type Where = Record<string, unknown>;

interface DataFilter {
  equals?: unknown;
  gte?: string;
  path: string[];
}

interface FindManyArgs {
  orderBy?: unknown;
  skip?: number;
  take?: number;
  where: Where;
}

const ORG = 'org-1';
const BRAND = 'brand-1';
const NOW = new Date('2026-10-19T12:00:00.000Z');
const TOMORROW = '2026-10-20T00:00:00.000Z';
const YESTERDAY = '2026-10-18T00:00:00.000Z';

// Prisma JSON-path and relational filters, as Postgres would apply them.
const matchesData = (data: Record<string, unknown>, filter: DataFilter) => {
  const value = filter.path.reduce<unknown>(
    (current, key) => (current as Record<string, unknown> | undefined)?.[key],
    data,
  );
  if (filter.equals === Prisma.AnyNull) return value == null;
  if (filter.equals !== undefined) return value === filter.equals;
  return typeof value === 'string' && value >= String(filter.gte);
};
const matches = (row: PatternRow, where: Where): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (key === 'AND') {
      return (condition as Where[]).every((clause) => matches(row, clause));
    }
    if (key === 'OR') {
      return (condition as Where[]).some((clause) => matches(row, clause));
    }
    if (key === 'data') return matchesData(row.data, condition as DataFilter);
    return row[key as keyof PatternRow] === condition;
  });

describe('CreativePatternsService', () => {
  let rows: PatternRow[];
  let service: CreativePatternsService;

  const seed = (
    id: string,
    data: Record<string, unknown>,
    fields: Partial<PatternRow> = {},
  ) => {
    rows.push({
      brandId: null,
      data: { scope: 'public', ...data },
      id,
      isDeleted: false,
      organizationId: ORG,
      // Every seeded row is fresher than the one before it.
      updatedAt: new Date(Date.UTC(2026, 0, rows.length + 1)),
      ...fields,
    });
  };
  const idsOf = (documents: { id: string }[]) => documents.map((d) => d.id);

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    rows = [];

    const freshestFirst = (a: PatternRow, b: PatternRow) =>
      b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id);
    const find = ({ skip = 0, take, where }: FindManyArgs) =>
      rows
        .filter((row) => matches(row, where))
        .sort(freshestFirst)
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((row) => ({ ...row }));
    const creativePattern = {
      count: async ({ where }: { where: Where }) =>
        rows.filter((row) => matches(row, where)).length,
      create: async ({
        data,
      }: {
        data: Omit<PatternRow, 'id' | 'isDeleted' | 'updatedAt'>;
      }) => {
        const row = {
          ...data,
          id: `pattern-${rows.length + 1}`,
          isDeleted: false,
          updatedAt: new Date(),
        };
        rows.push(row);
        return { ...row };
      },
      findMany: async (args: FindManyArgs) => find(args),
      update: async ({
        data,
        where,
      }: {
        data: Partial<PatternRow>;
        where: Where;
      }) => {
        const row = rows.find((candidate) => matches(candidate, where));
        if (!row) throw new Error('Record to update not found');
        return { ...Object.assign(row, data, { updatedAt: new Date() }) };
      },
    };

    service = new CreativePatternsService({
      creativePattern,
    } as unknown as PrismaService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('findAll', () => {
    beforeEach(() => {
      seed('oldest', { platform: 'tiktok' });
      seed('expired', { validUntil: YESTERDAY });
      seed('deleted', {}, { isDeleted: true });
      seed('foreign', {}, { organizationId: 'org-2' });
      seed('valid', { patternType: 'hook', validUntil: TOMORROW });
      seed('branded', { platform: 'instagram' }, { brandId: BRAND });
      seed('private', { scope: 'private' });
    });

    it('pages the organization unexpired patterns, freshest first', async () => {
      await expect(
        service.findAll({ organizationId: ORG }, { limit: 2, page: 2 }),
      ).resolves.toEqual(
        expect.objectContaining({
          docs: [
            expect.objectContaining({ id: 'valid', patternType: 'hook' }),
            expect.objectContaining({ id: 'oldest', platform: 'tiktok' }),
          ],
          hasNextPage: false,
          hasPrevPage: true,
          page: 2,
          totalDocs: 4,
          totalPages: 2,
        }),
      );
    });

    it.each([
      [{ brandId: BRAND }, ['branded']],
      [{ platform: 'tiktok' }, ['oldest']],
      [{ patternType: 'hook' as PatternType }, ['valid']],
      [{ scope: 'private' }, ['private']],
    ])('narrows the page by %o', async (filters, expected) => {
      const result = await service.findAll(
        { organizationId: ORG, ...filters },
        { limit: 10, page: 1 },
      );

      expect(idsOf(result.docs)).toEqual(expected);
      expect(result.totalDocs).toBe(expected.length);
    });

    it('describes each pattern with its brand and organization', async () => {
      const result = await service.findAll(
        { brandId: BRAND, organizationId: ORG },
        { limit: 1, page: 1 },
      );

      expect(result.docs[0]).toMatchObject({
        brand: BRAND,
        data: { platform: 'instagram', scope: 'public' },
        organization: ORG,
        platform: 'instagram',
      });
    });
  });

  describe('findRanked', () => {
    beforeEach(() => {
      seed('mid', { avgPerformanceScore: 50 });
      seed('top-expired', { avgPerformanceScore: 99, validUntil: YESTERDAY });
      seed('top', { avgPerformanceScore: 90, validUntil: TOMORROW });
      seed('unscored', {});
      seed(
        'foreign',
        { avgPerformanceScore: 100 },
        { organizationId: 'org-2' },
      );
      seed(
        'brand-low',
        { avgPerformanceScore: 10, platform: 'x' },
        { brandId: BRAND },
      );
    });

    it.each([
      [{}, ['top', 'mid', 'brand-low', 'unscored']],
      [{ limit: 2 }, ['top', 'mid']],
      [{ brandId: BRAND }, ['brand-low']],
      [{ platform: 'x' }, ['brand-low']],
    ])('ranks unexpired patterns by score (%o)', async (filters, expected) => {
      const ranked = await service.findRanked({
        organizationId: ORG,
        ...filters,
      });

      expect(idsOf(ranked)).toEqual(expected);
    });

    it('returns at most one hundred patterns', async () => {
      rows = Array.from({ length: 120 }, (_, index) => ({
        brandId: null,
        data: { avgPerformanceScore: index },
        id: `pattern-${index}`,
        isDeleted: false,
        organizationId: ORG,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      }));

      await expect(
        service.findRanked({ limit: 500, organizationId: ORG }),
      ).resolves.toHaveLength(100);
    });
  });

  describe('findTopForBrand', () => {
    beforeEach(() => {
      seed('org-wide', { avgPerformanceScore: 40, patternType: 'hook' });
      seed(
        'mine',
        { avgPerformanceScore: 80, patternType: 'cta', scope: 'private' },
        { brandId: BRAND },
      );
      seed('other-brand', { avgPerformanceScore: 95 }, { brandId: 'brand-2' });
      seed('draft', { avgPerformanceScore: 99, scope: 'draft' });
      seed('expired', { avgPerformanceScore: 90, validUntil: YESTERDAY });
    });

    it.each([
      [undefined, ['mine', 'org-wide']],
      [{ limit: 1 }, ['mine']],
      [{ patternTypes: ['hook' as PatternType] }, ['org-wide']],
    ])(
      'ranks the brand and organization-wide patterns (%o)',
      async (options, expected) => {
        const top = await service.findTopForBrand(ORG, BRAND, options);

        expect(idsOf(top)).toEqual(expected);
      },
    );
  });

  describe('upsertPattern', () => {
    const identity = {
      formula: 'Question hook',
      industry: 'fitness',
      organizationId: ORG,
      patternType: 'hook',
      platform: 'tiktok',
      scope: 'private',
    };

    it('creates a pattern, then revises the same one', async () => {
      const created = await service.upsertPattern({
        ...identity,
        avgPerformanceScore: 40,
        brandId: BRAND,
      });
      const revised = await service.upsertPattern({
        ...identity,
        avgPerformanceScore: 75,
        brandId: BRAND,
      });

      expect(revised.id).toBe(created.id);
      expect(rows).toEqual([
        expect.objectContaining({
          brandId: BRAND,
          data: expect.objectContaining({ avgPerformanceScore: 75 }),
          organizationId: ORG,
        }),
      ]);
    });

    it.each([
      ['another brand', { brandId: 'brand-2' }],
      ['the organization-wide scope', { brandId: undefined }],
      ['another platform', { brandId: BRAND, platform: 'instagram' }],
    ])('keeps a separate pattern for %s', async (_case, fields) => {
      await service.upsertPattern({ ...identity, brandId: BRAND });

      await service.upsertPattern({ ...identity, ...fields });

      expect(rows).toHaveLength(2);
    });

    it('never revises a pattern of another organization', async () => {
      seed(
        'foreign',
        { ...identity, organizationId: 'org-2' },
        { brandId: BRAND, organizationId: 'org-2' },
      );

      await service.upsertPattern({ ...identity, brandId: BRAND });

      expect(rows.map((row) => row.organizationId)).toEqual(['org-2', ORG]);
    });

    it('refuses a pattern without an organization', async () => {
      await expect(
        service.upsertPattern({ ...identity, organizationId: undefined }),
      ).rejects.toThrow('CreativePattern organizationId is required');
      expect(rows).toEqual([]);
    });
  });
});
