import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { AssetGateService } from '@api/collections/organization-settings/services/asset-gate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IngredientStatus } from '@genfeedai/contracts';
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
  const sourceId = 'cmingredient000000000000001';
  const tagId = 'cmtag000000000000000000001';
  let markFirstAssetGenerated: ReturnType<typeof vi.fn>;
  let service: MusicsService;
  let ingredientDelegate: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    markFirstAssetGenerated = vi.fn().mockResolvedValue(undefined);
    ingredientDelegate = {
      create: vi.fn().mockResolvedValue({
        id: 'music-1',
        organizationId: 'org-1',
        status: 'GENERATED',
      }),
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
      tags: [tagId],
    });

    expect(markFirstAssetGenerated).not.toHaveBeenCalled();
    expect(ingredientDelegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tags: { set: [{ id: tagId }] },
        }),
      }),
    );
  });

  it('normalizes relations for non-GENERATED creates', async () => {
    await service.create({
      sources: [sourceId],
      status: IngredientStatus.PROCESSING,
      tags: [tagId],
      text: 'Ambient focus track',
    });

    expect(ingredientDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sources: {
            connect: [{ id: sourceId }],
          },
          tags: { connect: [{ id: tagId }] },
        }),
      }),
    );
  });

  it('uses create-context population for a GENERATED create by default', async () => {
    await service.create({
      status: IngredientStatus.GENERATED,
      text: 'Ambient focus track',
    });

    expect(ingredientDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          brand: expect.objectContaining({ select: expect.any(Object) }),
          metadata: expect.objectContaining({ select: expect.any(Object) }),
          prompt: expect.objectContaining({ select: expect.any(Object) }),
        },
      }),
    );
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
