import {
  bindPlaceholderToRemix,
  linkImportedSourceLineage,
} from '@api/collections/content-runs/services/brand-remix-run-placeholder';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { BrandRemixRunConfig } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { beforeEach, describe, expect, it } from 'vitest';

interface IngredientRow {
  brandId: string;
  groupId?: string;
  groupIndex?: number;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  sources: string[];
  templateVersion?: number;
}

type Where = Record<string, unknown>;

const matches = (row: IngredientRow, where: Where): boolean =>
  Object.entries(where).every(([key, expected]) => {
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (expected && typeof expected === 'object' && 'in' in expected) {
      return (expected as { in: unknown[] }).in.includes(actual);
    }
    return actual === expected;
  });

describe('brand remix placeholder binding', () => {
  let ingredients: IngredientRow[];
  let prisma: PrismaService;

  const row = (id: string, overrides: Partial<IngredientRow> = {}) => ({
    brandId: 'brand-1',
    id,
    isDeleted: false,
    organizationId: 'org-1',
    sources: [],
    ...overrides,
  });
  const find = (id: string) => ingredients.find((entry) => entry.id === id);

  beforeEach(() => {
    ingredients = [
      row('generated-1', { groupId: 'run-1', groupIndex: 1 }),
      row('csource00000001'),
      row('cmedia000000001'),
    ];
    prisma = {
      ingredient: {
        findMany: async ({ where }: { where: Where }) =>
          ingredients
            .filter((entry) => matches(entry, where))
            .map(({ id }) => ({ id })),
        update: async ({
          data,
          where,
        }: {
          data: { sources: { connect: Array<{ id: string }> } };
          where: Where;
        }) => {
          const target = ingredients.find((entry) => matches(entry, where));
          if (!target) {
            throw new Error('Record to update not found');
          }
          target.sources.push(...data.sources.connect.map(({ id }) => id));
          return target;
        },
        updateMany: async ({
          data,
          where,
        }: {
          data: { templateVersion: number };
          where: Where;
        }) => {
          const targets = ingredients.filter((entry) => matches(entry, where));
          for (const target of targets) {
            target.templateVersion = data.templateVersion;
          }
          return { count: targets.length };
        },
      },
    } as unknown as PrismaService;
  });

  function configFor(
    selector: BrandRemixRunConfig['sourceSnapshot']['selector'],
    media?: BrandRemixRunConfig['sourceSnapshot']['media'],
  ): BrandRemixRunConfig {
    return {
      sourceSnapshot: {
        capturedAt: '2026-08-20T10:00:00.000Z',
        evidence: ['hook'],
        media,
        metrics: {},
        pattern: {},
        platform: 'x',
        selector,
        sourceId: 'csource00000001',
        title: 'hook',
      },
    } as unknown as BrandRemixRunConfig;
  }

  const importedConfig = (
    media?: BrandRemixRunConfig['sourceSnapshot']['media'],
  ) =>
    configFor(
      { importedSourceId: 'csource00000001', kind: 'imported_source' },
      media,
    );
  const sourcePostConfig = () =>
    configFor({ kind: 'source_post', sourcePostId: 'source-post-1' });

  const binding = (config: BrandRemixRunConfig) => ({
    brandId: 'brand-1',
    config,
    groupIndex: 1,
    ingredientId: 'generated-1',
    organizationId: 'org-1',
    recipeRevision: 3,
    runId: 'run-1',
  });

  it('tags the run-scoped placeholder with the remix revision', async () => {
    await bindPlaceholderToRemix(prisma, binding(sourcePostConfig()));

    expect(find('generated-1')).toMatchObject({
      sources: [],
      templateVersion: 3,
    });
  });

  it.each([
    ['in another organization', { organizationId: 'org-2' }],
    ['in another run', { groupId: 'run-2' }],
    ['deleted', { isDeleted: true }],
  ])(
    'refuses a placeholder %s before any lineage is written',
    async (_label, overrides) => {
      Object.assign(ingredients[0] as IngredientRow, overrides);

      await expect(
        bindPlaceholderToRemix(prisma, binding(importedConfig())),
      ).rejects.toThrow(/could not be bound/);
      expect(find('generated-1')).toMatchObject({ sources: [] });
      expect(find('generated-1')?.templateVersion).toBeUndefined();
    },
  );

  it('links a generated Library output to the saved source and its prepared media', async () => {
    await bindPlaceholderToRemix(
      prisma,
      binding(
        importedConfig({
          assetId: 'cmedia000000001',
          category: 'image',
          purpose: 'analysis_only',
          status: 'saved',
        }),
      ),
    );

    expect(find('generated-1')?.sources).toEqual([
      'csource00000001',
      'cmedia000000001',
    ]);
  });

  it('links only the source when its media could not be saved', async () => {
    await linkImportedSourceLineage(
      prisma,
      binding(
        importedConfig({
          purpose: 'analysis_only',
          reason: 'expired',
          status: 'unavailable',
        }),
      ),
    );

    expect(find('generated-1')?.sources).toEqual(['csource00000001']);
  });

  it.each([
    ['deleted', { isDeleted: true }],
    ['owned by another brand', { brandId: 'brand-2' }],
  ])(
    'stops before paid dispatch when the saved source is %s',
    async (_label, overrides) => {
      Object.assign(find('csource00000001') as IngredientRow, overrides);

      await expect(
        linkImportedSourceLineage(prisma, binding(importedConfig())),
      ).rejects.toThrow(/no longer available/);
      expect(find('generated-1')?.sources).toEqual([]);
    },
  );

  it('leaves every other source kind untouched', async () => {
    await linkImportedSourceLineage(prisma, binding(sourcePostConfig()));

    expect(find('generated-1')?.sources).toEqual([]);
  });
});
