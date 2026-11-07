import { ContentLearningAdminController } from '@api/collections/content-learning/controllers/content-learning-admin.controller';
import type { LearningPromptSlotOutcomeService } from '@api/collections/content-learning/services/learning-prompt-slot-outcome.service';
import { LearningReadService } from '@api/collections/content-learning/services/learning-read.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (_req: unknown, _serializer: unknown, data: unknown) =>
    data,
  serializeSingle: (_req: unknown, _serializer: unknown, data: unknown) => ({
    data,
  }),
}));

interface LearningRow {
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  updatedAt: Date;
}

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 8, 1);

/**
 * Rows 1-4 are live and row 5 is soft-deleted. Creation order runs opposite
 * to edit order, so a page shows which column it was sorted by.
 */
function learningRows(): LearningRow[] {
  return [1, 2, 3, 4, 5].map((n) => ({
    createdAt: new Date(BASE + n * DAY),
    id: `row-${n}`,
    isDeleted: n === 5,
    updatedAt: new Date(BASE - n * DAY),
  }));
}

function table(rows: LearningRow[]) {
  const live = (where: { isDeleted: boolean }) =>
    rows.filter((row) => row.isDeleted === where.isDeleted);
  return {
    count: async ({ where }: { where: { isDeleted: boolean } }) =>
      live(where).length,
    findMany: async ({
      orderBy,
      skip,
      take,
      where,
    }: {
      orderBy: Array<Record<string, 'desc'>>;
      skip: number;
      take: number;
      where: { isDeleted: boolean };
    }) => {
      const field = Object.keys(orderBy[0] ?? {})[0] as
        | 'createdAt'
        | 'updatedAt';
      return live(where)
        .sort(
          (a, b) =>
            b[field].getTime() - a[field].getTime() || b.id.localeCompare(a.id),
        )
        .slice(skip, skip + take);
    },
  };
}

function makeController(
  slotOutcomes: Partial<LearningPromptSlotOutcomeService> = {},
) {
  const prisma = {
    contentLearningAccount: table(learningRows()),
    contentLearningDataset: table(learningRows()),
    contentLearningRelease: table(learningRows()),
    contentLearningRun: table(learningRows()),
  };
  return new ContentLearningAdminController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new LearningReadService(prisma as unknown as PrismaService, {} as never),
    slotOutcomes as LearningPromptSlotOutcomeService,
  );
}

describe('ContentLearningAdminController list endpoints', () => {
  const request = {} as Request;
  const query = { limit: 2, page: 2 };

  it.each([
    ['accounts', ['row-3', 'row-4']],
    ['health', ['row-3', 'row-4']],
    ['datasetList', ['row-2', 'row-1']],
    ['runList', ['row-2', 'row-1']],
    ['releaseList', ['row-2', 'row-1']],
  ] as const)(
    '%s pages live rows in the database and reports the total',
    async (method, ids) => {
      const result = await makeController()[method](request, query);

      expect(result).toMatchObject({
        docs: ids.map((id) => expect.objectContaining({ id })),
        hasNextPage: false,
        hasPrevPage: true,
        limit: 2,
        page: 2,
        totalDocs: 4,
        totalPages: 2,
      });
    },
  );
});

describe('ContentLearningAdminController prompt slot report', () => {
  function reportingController() {
    const requested: unknown[] = [];
    const controller = makeController({
      report: async (input) => {
        requested.push(input);
        return {
          groups: [],
          isPooled: input.organizationIds.length > 1,
          organizationIds: input.organizationIds,
        } as unknown as Awaited<
          ReturnType<LearningPromptSlotOutcomeService['report']>
        >;
      },
    });
    return { controller, requested };
  }

  it('reports the slot outcomes of the organization named in the query', async () => {
    const { controller, requested } = reportingController();

    await expect(
      controller.promptSlots({ brandId: 'brand-1', organizationId: 'org-1' }),
    ).resolves.toEqual({
      data: { groups: [], isPooled: false, organizationIds: ['org-1'] },
    });
    expect(requested).toEqual([
      {
        brandId: 'brand-1',
        credentialId: undefined,
        organizationIds: ['org-1'],
      },
    ]);
  });

  it('pools the organizations named in organizationIds', async () => {
    const { controller } = reportingController();

    await expect(
      controller.promptSlots({ organizationIds: 'org-1,org-2' }),
    ).resolves.toEqual({
      data: {
        groups: [],
        isPooled: true,
        organizationIds: ['org-1', 'org-2'],
      },
    });
  });

  it.each([
    ['no organization', {}],
    ['both forms', { organizationId: 'a', organizationIds: 'b,c' }],
  ])(
    'rejects a request with %s before reading anything',
    async (_label, query) => {
      const { controller, requested } = reportingController();

      await expect(controller.promptSlots(query)).rejects.toMatchObject({
        status: 400,
      });
      expect(requested).toEqual([]);
    },
  );
});
