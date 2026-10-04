import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

describe('ingredient tag assignment ownership', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const findMany = vi.fn();
  const service = new IngredientsService(
    { tag: { findMany } } as unknown as PrismaService,
    {} as LoggerService,
    {} as ModuleRef,
  );
  beforeEach(() => vi.clearAllMocks());

  it('allows brand, organization-wide and default tags and deduplicates repeated ids', async () => {
    const tagId = testId('tag');
    findMany.mockResolvedValue([{ id: tagId }]);

    await service.assertClientTags([tagId, tagId], organizationId, brandId);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        id: { in: [tagId] },
        isDeleted: false,
        OR: [
          { brandId: null, organizationId },
          { brandId: { in: [brandId] }, organizationId },
          { brandId: null, organizationId: null, userId: null },
        ],
      },
      select: { id: true },
    });
  });

  it('offers only organization-wide and default tags to an asset with no brand', async () => {
    const tagId = testId('tag');
    findMany.mockResolvedValue([{ id: tagId }]);

    await service.assertClientTags([tagId], organizationId, null);

    expect(findMany.mock.calls[0]?.[0].where.OR[1]).toEqual({
      brandId: { in: [] },
      organizationId,
    });
  });

  it('rejects missing, deleted, other-brand or foreign tenant tags', async () => {
    findMany.mockResolvedValue([{ id: testId('tag') }]);
    await expect(
      service.assertClientTags(
        [testId('tag'), testId('tag', 2)],
        organizationId,
        brandId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows clearing tags without a query', async () => {
    await service.assertClientTags([], organizationId, brandId);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('fails closed without an organization', async () => {
    await expect(
      service.assertClientTags([testId('tag')], '', brandId),
    ).rejects.toThrow(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
