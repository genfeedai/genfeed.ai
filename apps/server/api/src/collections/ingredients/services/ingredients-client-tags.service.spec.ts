import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

describe('ingredient tag assignment ownership', () => {
  const findMany = vi.fn();
  const service = new IngredientsService(
    { tag: { findMany } } as unknown as PrismaService,
    {} as LoggerService,
    {} as ModuleRef,
  );
  beforeEach(() => vi.clearAllMocks());

  it('allows active tenant tags and deduplicates repeated ids', async () => {
    findMany.mockResolvedValue([{ id: 'tag-1' }]);
    await service.assertClientTags(['tag-1', 'tag-1'], 'org-1');
    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['tag-1'] },
        organizationId: 'org-1',
        isDeleted: false,
      },
      select: { id: true },
    });
  });
  it('rejects missing, deleted or foreign tenant tags', async () => {
    findMany.mockResolvedValue([{ id: 'tag-1' }]);
    await expect(
      service.assertClientTags(['tag-1', 'foreign-tag'], 'org-1'),
    ).rejects.toThrow(BadRequestException);
  });
  it('allows clearing tags without a query', async () => {
    await service.assertClientTags([], 'org-1');
    expect(findMany).not.toHaveBeenCalled();
  });
  it('fails closed without an organization', async () => {
    await expect(service.assertClientTags(['tag-1'], '')).rejects.toThrow(
      BadRequestException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
