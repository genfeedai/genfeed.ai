import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/enums';
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

/**
 * First-asset unlock gate interception. Every generation completion flows
 * through IngredientsService.create / patch / patchAll (Images/Videos/Voices all
 * extend it), so the gate fires from those three write paths only on a GENERATED
 * transition, keyed on the owning org.
 */
describe('IngredientsService — asset-gate interception', () => {
  let service: IngredientsService;
  let markFirstAssetGenerated: ReturnType<typeof vi.fn>;
  let delegate: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    markFirstAssetGenerated = vi.fn().mockResolvedValue(undefined);
    delegate = {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 'ing-1' }),
      updateMany: vi.fn(),
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
          useValue: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
        },
        // Resolved by IngredientsService via moduleRef.get(AssetGateService).
        { provide: AssetGateService, useValue: { markFirstAssetGenerated } },
      ],
    }).compile();

    service = module.get<IngredientsService>(IngredientsService);
  });

  describe('patch', () => {
    it('marks the org on a GENERATED transition', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'ing-1',
        organizationId: 'org-1',
        status: 'GENERATED',
      });

      await service.patch('ing-1', { status: IngredientStatus.GENERATED });

      expect(markFirstAssetGenerated).toHaveBeenCalledWith('org-1');
    });

    it('does NOT mark on a non-GENERATED patch', async () => {
      delegate.findFirst.mockResolvedValue({
        id: 'ing-1',
        organizationId: 'org-1',
        status: 'PROCESSING',
      });

      await service.patch('ing-1', { status: IngredientStatus.PROCESSING });

      expect(markFirstAssetGenerated).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('marks the org when an asset is created directly as GENERATED', async () => {
      delegate.create.mockResolvedValue({
        id: 'ing-2',
        organizationId: 'org-2',
        status: 'GENERATED',
      });
      // create() re-reads via getPopulationForContext include path.
      delegate.findFirst.mockResolvedValue({
        id: 'ing-2',
        organizationId: 'org-2',
        status: 'GENERATED',
      });

      await service.create({
        brand: 'brand-1',
        status: IngredientStatus.GENERATED,
      } as never);

      expect(markFirstAssetGenerated).toHaveBeenCalledWith('org-2');
    });

    it('does NOT mark when created as a draft', async () => {
      delegate.create.mockResolvedValue({
        id: 'ing-3',
        organizationId: 'org-3',
        status: 'DRAFT',
      });
      delegate.findFirst.mockResolvedValue({
        id: 'ing-3',
        organizationId: 'org-3',
        status: 'DRAFT',
      });

      await service.create({ brand: 'brand-1' } as never);

      expect(markFirstAssetGenerated).not.toHaveBeenCalled();
    });
  });

  describe('patchAll', () => {
    it('captures owning orgs BEFORE the update and marks each distinct org', async () => {
      // Distinct orgs of the rows matched by the filter, read pre-update.
      delegate.findMany.mockResolvedValue([
        { organizationId: 'org-a' },
        { organizationId: 'org-b' },
      ]);
      delegate.updateMany.mockResolvedValue({ count: 2 });

      await service.patchAll(
        { status: IngredientStatus.PROCESSING },
        { status: IngredientStatus.GENERATED },
      );

      // Pre-update read happened, so the status flip can't hide the rows.
      expect(delegate.findMany).toHaveBeenCalled();
      expect(markFirstAssetGenerated).toHaveBeenCalledWith('org-a');
      expect(markFirstAssetGenerated).toHaveBeenCalledWith('org-b');
      expect(markFirstAssetGenerated).toHaveBeenCalledTimes(2);
    });

    it('does NOT mark when no rows changed', async () => {
      delegate.findMany.mockResolvedValue([{ organizationId: 'org-a' }]);
      delegate.updateMany.mockResolvedValue({ count: 0 });

      await service.patchAll(
        { id: 'missing' },
        { status: IngredientStatus.GENERATED },
      );

      expect(markFirstAssetGenerated).not.toHaveBeenCalled();
    });

    it('does NOT mark or pre-read on a non-GENERATED bulk update', async () => {
      delegate.updateMany.mockResolvedValue({ count: 5 });

      await service.patchAll({ brandId: 'brand-1' }, { isDeleted: true });

      expect(delegate.findMany).not.toHaveBeenCalled();
      expect(markFirstAssetGenerated).not.toHaveBeenCalled();
    });
  });
});
