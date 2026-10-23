import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MediaKeyRepairService } from '@api/services/media-urls/media-key-repair.service';
import { IngredientCategory } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';

vi.mock('@sentry/nestjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

const imageId = testId('ingredient', 1);
const orgId = testId('org', 1);
const image = {
  category: IngredientCategory.IMAGE,
  id: imageId,
  organizationId: orgId,
  s3Key: null,
};

async function setup() {
  const prisma = {
    ingredient: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const files = { storedObjectExists: vi.fn().mockResolvedValue(true) };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const module = await Test.createTestingModule({
    providers: [
      MediaKeyRepairService,
      { provide: PrismaService, useValue: prisma },
      { provide: FilesClientService, useValue: files },
      { provide: LoggerService, useValue: logger },
    ],
  }).compile();
  return { files, logger, prisma, service: module.get(MediaKeyRepairService) };
}

describe('MediaKeyRepairService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the legacy key from category and id', () => {
    expect(MediaKeyRepairService.canonicalKey(image)).toBe(
      `ingredients/images/${imageId}`,
    );
    expect(
      MediaKeyRepairService.canonicalKey({
        category: IngredientCategory.VIDEO_EDIT,
        id: imageId,
      }),
    ).toBe(`ingredients/videos/${imageId}`);
    expect(
      MediaKeyRepairService.canonicalKey({
        category: IngredientCategory.MUSIC,
        id: imageId,
      }),
    ).toBeNull();
  });

  it('treats only empty and URL-shaped keys as broken', () => {
    expect(MediaKeyRepairService.isBrokenKey(null)).toBe(true);
    expect(MediaKeyRepairService.isBrokenKey('')).toBe(true);
    expect(MediaKeyRepairService.isBrokenKey('https://cdn.example/x.png')).toBe(
      true,
    );
    expect(MediaKeyRepairService.isBrokenKey('ingredients/images/a')).toBe(
      false,
    );
  });

  it('persists the canonical key only after the object is verified', async () => {
    const { service, files, prisma } = await setup();
    await expect(service.repair(image)).resolves.toEqual({
      kind: 'repaired',
      storageKey: `ingredients/images/${imageId}`,
    });
    expect(files.storedObjectExists).toHaveBeenCalledWith(
      `ingredients/images/${imageId}`,
    );
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      data: { s3Key: `ingredients/images/${imageId}` },
      where: {
        id: imageId,
        isDeleted: false,
        OR: [
          { s3Key: null },
          { s3Key: '' },
          { s3Key: { mode: 'insensitive', startsWith: 'http' } },
        ],
        organizationId: orgId,
      },
    });
  });

  it('never writes an unverified key', async () => {
    const { service, files, prisma } = await setup();
    files.storedObjectExists.mockResolvedValue(false);
    await expect(service.repair(image)).resolves.toEqual({
      kind: 'object-missing',
      storageKey: `ingredients/images/${imageId}`,
    });
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('verifies but does not write on a dry run', async () => {
    const { service, files, prisma } = await setup();
    const outcome = await service.repair(image, false);
    expect(outcome.kind).toBe('repaired');
    expect(files.storedObjectExists).toHaveBeenCalledOnce();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a healthy key', { ...image, s3Key: 'ingredients/images/ok' }],
    ['an ownerless row', { ...image, organizationId: null }],
    [
      'an unsupported category',
      { ...image, category: IngredientCategory.MUSIC },
    ],
  ])('skips %s without touching storage', async (_name, candidate) => {
    const { service, files, prisma } = await setup();
    await expect(service.repair(candidate)).resolves.toEqual({
      kind: 'unsupported',
    });
    expect(files.storedObjectExists).not.toHaveBeenCalled();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
  });

  it('scans a bounded, cursor-resumable batch and keeps going past a failing row', async () => {
    const { service, files, prisma, logger } = await setup();
    const second = { ...image, id: testId('ingredient', 2) };
    const third = { ...image, id: testId('ingredient', 3) };
    prisma.ingredient.findMany.mockResolvedValue([image, second, third]);
    files.storedObjectExists
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('files down'))
      .mockResolvedValueOnce(false);

    const totals = await service.repairBatch(testId('ingredient', 9));

    expect(totals).toEqual({
      failed: 1,
      lastId: third.id,
      missing: 1,
      repaired: 1,
    });
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { id: 'asc' },
        take: 25,
        where: expect.objectContaining({
          id: { gt: testId('ingredient', 9) },
          isDeleted: false,
          organizationId: { not: null },
        }),
      }),
    );
    expect(logger.error).toHaveBeenCalledOnce();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { area: 'media-key-repair', ingredientId: second.id },
    });
  });

  it('reports an empty batch with no cursor so the sweep can wrap around', async () => {
    const { service } = await setup();
    await expect(service.repairBatch()).resolves.toEqual({
      failed: 0,
      lastId: null,
      missing: 0,
      repaired: 0,
    });
  });
});
