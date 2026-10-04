import { assertTagsVisibleToBrand } from '@api/collections/ingredients/utils/assert-tags-visible-to-brand.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';

describe('assertTagsVisibleToBrand', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const findMany = vi.fn();
  const prisma = { tag: { findMany } } as unknown as Pick<PrismaService, 'tag'>;

  beforeEach(() => vi.clearAllMocks());

  it('accepts tags the brand can see', async () => {
    const tagId = testId('tag');
    findMany.mockResolvedValue([{ id: tagId }]);

    await expect(
      assertTagsVisibleToBrand(prisma, [tagId], { brandId, organizationId }),
    ).resolves.toBeUndefined();
  });

  it('looks tags up as brand, organization-wide or legacy default only', async () => {
    findMany.mockResolvedValue([]);

    await assertTagsVisibleToBrand(prisma, [], {
      brandId,
      organizationId,
    }).catch(() => undefined);
    expect(findMany).not.toHaveBeenCalled();

    await assertTagsVisibleToBrand(prisma, [testId('tag')], {
      brandId,
      organizationId,
    }).catch(() => undefined);

    expect(findMany.mock.calls[0]?.[0].where.OR).toEqual([
      { brandId: null, organizationId },
      { brandId: { in: [brandId] }, organizationId },
      { brandId: null, organizationId: null, userId: null },
    ]);
    expect(findMany.mock.calls[0]?.[0].where.isDeleted).toBe(false);
  });

  it('refuses a tag the lookup did not return, however many others were', async () => {
    findMany.mockResolvedValue([{ id: testId('tag', 1) }]);

    await expect(
      assertTagsVisibleToBrand(prisma, [testId('tag', 1), testId('tag', 2)], {
        brandId,
        organizationId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never matches a brand tag for an asset without a brand', async () => {
    findMany.mockResolvedValue([]);

    await assertTagsVisibleToBrand(prisma, [testId('tag')], {
      brandId: null,
      organizationId,
    }).catch(() => undefined);

    expect(findMany.mock.calls[0]?.[0].where.OR[1]).toEqual({
      brandId: { in: [] },
      organizationId,
    });
  });

  it('counts a repeated id once', async () => {
    const tagId = testId('tag');
    findMany.mockResolvedValue([{ id: tagId }]);

    await expect(
      assertTagsVisibleToBrand(prisma, [tagId, tagId], {
        brandId,
        organizationId,
      }),
    ).resolves.toBeUndefined();
  });

  it('clears without a query, and fails closed without an organization', async () => {
    await assertTagsVisibleToBrand(prisma, [], { brandId, organizationId });
    expect(findMany).not.toHaveBeenCalled();

    await expect(
      assertTagsVisibleToBrand(prisma, [testId('tag')], {
        brandId,
        organizationId: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
