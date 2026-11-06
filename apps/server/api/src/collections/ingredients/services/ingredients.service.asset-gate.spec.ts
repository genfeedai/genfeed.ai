import type { IngredientServerCreate } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Same light schema-metadata mock the sibling spec uses so BaseService's
// getModelMeta('ingredient') resolves without a heavy PrismaClient import.
vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

// A small Prisma `where` interpreter: equality, `in`, and nested AND/OR.
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND') {
      return (expected as Where[]).every((part) => matches(row, part));
    }
    if (key === 'OR') {
      return (expected as Where[]).some((part) => matches(row, part));
    }
    if (expected && typeof expected === 'object' && 'in' in expected) {
      return (expected as { in: unknown[] }).in.includes(row[key]);
    }
    return (row[key] ?? null) === (expected ?? null);
  });
}

/**
 * First-asset unlock gate interception. Every generation completion flows
 * through IngredientsService.create / patch / patchAll (Images/Videos/Voices all
 * extend it), so the gate fires from those three write paths only on a GENERATED
 * transition, keyed on the owning org.
 */
describe('IngredientsService — asset-gate interception', () => {
  let marked: string[];
  let rows: Map<string, Row>;
  let service: IngredientsService;

  const seed = (row: Row) => rows.set(row.id, { isDeleted: false, ...row });
  const matching = (where: Where = {}) =>
    [...rows.values()].filter((row) => matches(row, where));

  beforeEach(async () => {
    marked = [];
    rows = new Map();
    let nextId = 1;

    const delegate = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          isDeleted: false,
          ...data,
          id: `ing-new-${nextId++}`,
        };
        rows.set(row.id, row);
        return row;
      },
      findFirst: async ({ where }: { where?: Where }) =>
        matching(where)[0] ?? null,
      findMany: async ({ where }: { where?: Where }) => matching(where),
      update: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Where;
      }) => {
        const [row] = matching(where);
        if (!row) {
          throw new Error('Record to update not found');
        }
        return Object.assign(row, data);
      },
      updateMany: async ({
        data,
        where,
      }: {
        data: Record<string, unknown>;
        where: Where;
      }) => {
        const hits = matching(where);
        for (const row of hits) {
          Object.assign(row, data);
        }
        return { count: hits.length };
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        {
          provide: PrismaService,
          useValue: { ingredient: delegate } as unknown as PrismaService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: () => undefined,
            error: () => undefined,
            warn: () => undefined,
          },
        },
        // Resolved by IngredientsService via moduleRef.get(AssetGateService).
        {
          provide: AssetGateService,
          useValue: {
            markFirstAssetGenerated: async (organizationId: string) => {
              marked.push(organizationId);
            },
          },
        },
      ],
    }).compile();

    service = module.get<IngredientsService>(IngredientsService);
  });

  describe('patch', () => {
    beforeEach(() => {
      seed({ id: 'ing-1', organizationId: 'org-1', status: 'PROCESSING' });
    });

    it('marks the org on a GENERATED transition', async () => {
      await service.patch('ing-1', { status: IngredientStatus.GENERATED });

      expect(rows.get('ing-1')?.status).toBe(IngredientStatus.GENERATED);
      expect(marked).toEqual(['org-1']);
    });

    it('does NOT mark on a non-GENERATED patch', async () => {
      await service.patch('ing-1', { status: IngredientStatus.VALIDATED });

      expect(rows.get('ing-1')?.status).toBe(IngredientStatus.VALIDATED);
      expect(marked).toEqual([]);
    });
  });

  describe('create', () => {
    it('marks the org when an asset is created directly as GENERATED', async () => {
      await service.create({
        brandId: 'brand-1',
        organizationId: 'org-2',
        status: IngredientStatus.GENERATED,
      } as IngredientServerCreate);

      expect(matching({ organizationId: 'org-2' })).toEqual([
        expect.objectContaining({ status: IngredientStatus.GENERATED }),
      ]);
      expect(marked).toEqual(['org-2']);
    });

    it('does NOT mark when created as a draft', async () => {
      await service.create({
        brandId: 'brand-1',
        organizationId: 'org-3',
      } as IngredientServerCreate);

      expect(matching({ organizationId: 'org-3' })).toHaveLength(1);
      expect(marked).toEqual([]);
    });
  });

  describe('patchAll', () => {
    beforeEach(() => {
      seed({
        brandId: 'brand-1',
        id: 'ing-a',
        organizationId: 'org-a',
        status: 'PROCESSING',
      });
      seed({
        brandId: 'brand-2',
        id: 'ing-b',
        organizationId: 'org-b',
        status: 'PROCESSING',
      });
    });

    it('captures owning orgs BEFORE the update and marks each distinct org', async () => {
      // The status flip would hide the rows from any read made after it.
      await expect(
        service.patchAll(
          { status: IngredientStatus.PROCESSING },
          { status: IngredientStatus.GENERATED },
        ),
      ).resolves.toEqual({ modifiedCount: 2 });

      expect(matching({ status: IngredientStatus.GENERATED })).toHaveLength(2);
      expect([...marked].sort()).toEqual(['org-a', 'org-b']);
    });

    it('does NOT mark when no rows changed', async () => {
      await expect(
        service.patchAll(
          { id: 'missing' },
          { status: IngredientStatus.GENERATED },
        ),
      ).resolves.toEqual({ modifiedCount: 0 });

      expect(marked).toEqual([]);
    });

    it('scopes a non-GENERATED bulk update to its owner without marking the asset gate', async () => {
      await expect(
        service.patchAll({ brandId: 'brand-1' }, { isDeleted: true }),
      ).resolves.toEqual({ modifiedCount: 1 });

      expect(rows.get('ing-a')?.isDeleted).toBe(true);
      expect(rows.get('ing-b')?.isDeleted).toBe(false);
      expect(marked).toEqual([]);
    });
  });
});
