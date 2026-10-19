import { ContentLearningAdminController } from '@api/collections/content-learning/controllers/content-learning-admin.controller';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

function makeController() {
  const delegate = () => ({
    count: vi.fn().mockResolvedValue(45),
    findMany: vi.fn().mockResolvedValue([{ id: 'row-1' }]),
  });
  const prisma = {
    contentLearningAccount: delegate(),
    contentLearningDataset: delegate(),
    contentLearningRelease: delegate(),
    contentLearningRun: delegate(),
  };
  const controller = new ContentLearningAdminController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    prisma as unknown as PrismaService,
  );
  return { controller, prisma };
}

describe('ContentLearningAdminController list endpoints', () => {
  const request = {} as never;
  const query = { limit: 10, page: 3 } as never;

  it.each([
    ['accounts', 'contentLearningAccount', 'updatedAt'],
    ['datasetList', 'contentLearningDataset', 'createdAt'],
    ['runList', 'contentLearningRun', 'createdAt'],
    ['releaseList', 'contentLearningRelease', 'createdAt'],
  ] as const)(
    '%s pages in the database and reports the total',
    async (method, model, sortField) => {
      const { controller, prisma } = makeController();

      const result = await controller[method](request, query);

      expect(prisma[model].findMany).toHaveBeenCalledWith({
        orderBy: [{ [sortField]: 'desc' }, { id: 'desc' }],
        skip: 20,
        take: 10,
        where: { isDeleted: false },
      });
      expect(prisma[model].count).toHaveBeenCalledWith({
        where: { isDeleted: false },
      });
      expect(serializeCollection).toHaveBeenCalled();
      expect(result).toMatchObject({
        docs: [{ id: 'row-1' }],
        hasNextPage: true,
        hasPrevPage: true,
        limit: 10,
        page: 3,
        totalDocs: 45,
        totalPages: 5,
      });
    },
  );

  it('serves the health read from the account inventory page', async () => {
    const { controller, prisma } = makeController();

    await controller.health(request, query);

    expect(prisma.contentLearningAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});
