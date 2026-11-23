import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import type { ModelCatalogSeedEntry } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';

import { ModelCatalogSeedService } from './model-catalog-seed.service';

interface StoredModel {
  cost: number;
  isActive: boolean;
  isDefault: boolean;
  isDeleted: boolean;
  isHighlighted: boolean;
  isPublic: boolean;
  key: string;
  organizationId: string | null;
}

interface KeyFilter {
  isDeleted: boolean;
  key: { in: string[] };
  organizationId: null;
  OR?: Array<Partial<StoredModel>>;
}

function entry(
  key: string,
  overrides: Partial<ModelCatalogSeedEntry>,
): ModelCatalogSeedEntry {
  return {
    category: ModelCategory.IMAGE,
    cost: 0,
    description: key,
    isActive: false,
    key,
    label: key,
    provider: ModelProvider.REPLICATE,
    ...overrides,
  } as ModelCatalogSeedEntry;
}

function row(key: string, overrides: Partial<StoredModel>): StoredModel {
  return {
    cost: 0,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isHighlighted: false,
    isPublic: true,
    key,
    organizationId: null,
    ...overrides,
  };
}

describe('ModelCatalogSeedService.retireInactiveCatalogRows', () => {
  let rows: StoredModel[];
  let service: ModelCatalogSeedService;

  const matches = (stored: StoredModel, where: KeyFilter): boolean =>
    stored.isDeleted === where.isDeleted &&
    stored.organizationId === where.organizationId &&
    where.key.in.includes(stored.key) &&
    (where.OR === undefined ||
      where.OR.some((clause) =>
        Object.entries(clause).every(
          ([field, value]) => stored[field as keyof StoredModel] === value,
        ),
      ));

  const find = (key: string): StoredModel | undefined =>
    rows.find((stored) => stored.key === key);

  beforeEach(() => {
    rows = [];
    const prisma = {
      model: {
        findMany: async ({ where }: { where: KeyFilter }) =>
          rows.filter((stored) => matches(stored, where)),
        updateMany: async ({
          data,
          where,
        }: {
          data: Partial<StoredModel>;
          where: KeyFilter;
        }) => {
          const hit = rows.filter((stored) => matches(stored, where));
          for (const stored of hit) Object.assign(stored, data);
          return { count: hit.length };
        },
      },
    };
    service = new ModelCatalogSeedService(
      prisma as unknown as PrismaService,
      { log: () => undefined } as unknown as LoggerService,
      { get: () => 'test' } as unknown as ConfigService,
    );
  });

  const catalog = [
    entry('retired/priced', {
      cost: 40,
      lifecycle: ModelLifecycle.RETIRED,
    }),
    entry('retired/default', { lifecycle: ModelLifecycle.RETIRED }),
    entry('uncurated/unpriced', {}),
    entry('uncurated/operator-priced', {}),
    entry('curated/live', { cost: 12, isActive: true }),
  ];

  it('reports the rows it would switch off and changes nothing on a dry run', async () => {
    rows = [
      row('retired/priced', { cost: 40, isHighlighted: true }),
      row('uncurated/unpriced', {}),
    ];

    const report = await service.retireInactiveCatalogRows(false, catalog);

    expect(report.applied).toBe(false);
    expect(report.retired.map((entryRow) => entryRow.key)).toEqual([
      'retired/priced',
      'uncurated/unpriced',
    ]);
    expect(find('retired/priced')).toMatchObject({
      isActive: true,
      isHighlighted: true,
      isPublic: true,
    });
  });

  it('switches off retired and unpriced rows, and keeps priced uncurated and live rows', async () => {
    rows = [
      row('retired/priced', { cost: 40, isHighlighted: true }),
      row('uncurated/unpriced', {}),
      row('uncurated/operator-priced', { cost: 9 }),
      row('curated/live', { cost: 12 }),
    ];

    const report = await service.retireInactiveCatalogRows(true, catalog);

    expect(report.applied).toBe(true);
    expect(find('retired/priced')).toMatchObject({
      isActive: false,
      isHighlighted: false,
      isPublic: false,
    });
    expect(find('uncurated/unpriced')).toMatchObject({
      isActive: false,
      isPublic: false,
    });
    expect(find('uncurated/operator-priced')).toMatchObject({
      isActive: true,
      isPublic: true,
    });
    expect(find('curated/live')).toMatchObject({
      isActive: true,
      isPublic: true,
    });
  });

  it('leaves a retired row that still holds a category default and names it', async () => {
    rows = [row('retired/default', { isDefault: true })];

    const report = await service.retireInactiveCatalogRows(true, catalog);

    expect(report.retired).toEqual([]);
    expect(report.skippedDefaults).toEqual(['retired/default']);
    expect(find('retired/default')?.isActive).toBe(true);
  });

  it('ignores rows that are already switched off and deleted rows', async () => {
    rows = [
      row('retired/priced', {
        isActive: false,
        isHighlighted: false,
        isPublic: false,
      }),
      row('uncurated/unpriced', { isDeleted: true }),
    ];

    const report = await service.retireInactiveCatalogRows(true, catalog);

    expect(report.retired).toEqual([]);
    expect(find('uncurated/unpriced')?.isActive).toBe(true);
  });
});
