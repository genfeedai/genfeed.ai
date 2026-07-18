import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

describe('MusicsService', () => {
  let markFirstAssetGenerated: ReturnType<typeof vi.fn>;
  let service: MusicsService;
  let ingredientDelegate: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    markFirstAssetGenerated = vi.fn().mockResolvedValue(undefined);
    ingredientDelegate = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'music-1',
        organizationId: 'org-1',
        status: 'GENERATED',
      }),
      update: vi.fn().mockResolvedValue({ id: 'music-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientsService,
        MusicsService,
        {
          provide: PrismaService,
          useValue: {
            ingredient: ingredientDelegate,
          } as unknown as PrismaService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: AssetGateService,
          useValue: { markFirstAssetGenerated },
        },
      ],
    }).compile();

    service = module.get<MusicsService>(MusicsService);
  });

  it('marks the organization when music reaches GENERATED', async () => {
    await service.patch('music-1', {
      status: IngredientStatus.GENERATED,
    });

    expect(markFirstAssetGenerated).toHaveBeenCalledOnce();
    expect(markFirstAssetGenerated).toHaveBeenCalledWith('org-1');
  });

  it('does not mark the organization for a non-GENERATED update', async () => {
    await service.patch('music-1', {
      status: IngredientStatus.PROCESSING,
    });

    expect(markFirstAssetGenerated).not.toHaveBeenCalled();
  });

  it('preserves requested population for a GENERATED update', async () => {
    await service.patch('music-1', { status: IngredientStatus.GENERATED }, [
      'metadata',
    ]);

    expect(ingredientDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { metadata: true },
      }),
    );
  });
});
