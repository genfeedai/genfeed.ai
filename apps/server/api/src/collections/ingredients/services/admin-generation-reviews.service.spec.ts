import { AdminGenerationReviewsService } from '@api/collections/ingredients/services/admin-generation-reviews.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@libs/prisma/tenant-context', () => ({
  crossOrgUnsafe: <T>(work: () => T) => work(),
}));

function setup(docs: Array<{ id: string }>) {
  const ingredients = {
    findAll: vi.fn().mockResolvedValue({ docs, totalDocs: docs.length }),
  };
  const prisma = {
    activity: {
      findMany: vi.fn().mockResolvedValue([
        { data: { value: JSON.stringify({ credits: 7 }) }, entityId: 'ing-1' },
        { data: { value: JSON.stringify({ credits: 99 }) }, entityId: 'ing-1' },
        { data: { value: 'junk' }, entityId: 'ing-2' },
      ]),
    },
  };
  return {
    ingredients,
    prisma,
    service: new AdminGenerationReviewsService(
      ingredients as never,
      prisma as never,
    ),
  };
}

describe('AdminGenerationReviewsService', () => {
  it('reads across organizations with the filter and the relations the ledger shows', async () => {
    const { ingredients, service } = setup([{ id: 'ing-1' }]);

    await service.list({ organizationId: 'org-1', page: 1 } as never);

    const [aggregate] = ingredients.findAll.mock.calls[0];
    expect(aggregate.where).toMatchObject({
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(aggregate.include).toEqual({
      metadata: true,
      organization: { select: { id: true, label: true } },
      prompt: true,
      user: { select: { email: true, handle: true, id: true } },
    });
  });

  it('attaches the newest recorded credits to each generation and null when unknown', async () => {
    const { prisma, service } = setup([{ id: 'ing-1' }, { id: 'ing-2' }]);

    const page = await service.list({ page: 1 } as never);

    expect(page.docs).toEqual([
      { generationCredits: 7, id: 'ing-1' },
      { generationCredits: null, id: 'ing-2' },
    ]);
    expect(prisma.activity.findMany.mock.calls[0][0].where).toMatchObject({
      entityId: { in: ['ing-1', 'ing-2'] },
      isDeleted: false,
    });
  });

  it('skips the credit lookup for an empty page', async () => {
    const { prisma, service } = setup([]);

    await service.list({ page: 1 } as never);

    expect(prisma.activity.findMany).not.toHaveBeenCalled();
  });
});
