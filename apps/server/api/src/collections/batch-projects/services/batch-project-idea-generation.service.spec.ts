import { BatchProjectIdeaGenerationService } from '@api/collections/batch-projects/services/batch-project-idea-generation.service';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
} from '@genfeedai/contracts';
import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';

type Row = Record<string, unknown>;

const scope = { organizationId: 'org-1', userId: 'user-1' };

function line(itemId: string, overrides: Row = {}): Row {
  return {
    attempt: 1,
    billingMode: 'platform',
    credits: 4,
    format: 'image',
    itemId,
    key: `batch-project-item:${itemId}:dispatch:1`,
    model: 'model-image',
    ...overrides,
  };
}

function quote(items: Row[], overrides: Row = {}): Row {
  return {
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    id: 'quote-1',
    items,
    revision: 3,
    total: 0,
    ...overrides,
  };
}

function project(overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    id: 'project-1',
    kind: BatchProjectKind.IDEAS,
    organizationId: 'org-1',
    quote: quote([line('item-1'), line('item-2')]),
    revision: 3,
    status: BatchProjectStatus.DRAFT,
    ...overrides,
  };
}

function item(id: string, overrides: Row = {}): Row {
  return {
    id,
    idea: { format: 'image', id: `idea-${id}` },
    retryCount: 0,
    status: BatchProjectItemStatus.PENDING,
    ...overrides,
  };
}

describe('BatchProjectIdeaGenerationService', () => {
  const prisma = {
    $transaction: vi.fn(
      async (operation: (client: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    ),
    batchProject: { updateMany: vi.fn() },
    batchProjectItem: { updateMany: vi.fn() },
  };
  const quotes = { build: vi.fn() };
  const credits = {
    checkOrganizationCreditsAvailable: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const dispatcher = { enqueue: vi.fn(), failItem: vi.fn() };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const service = new BatchProjectIdeaGenerationService(
    prisma as never,
    logger as never,
    quotes as never,
    credits as never,
    dispatcher as never,
  );
  const pending = [item('item-1'), item('item-2')];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.batchProject.updateMany.mockResolvedValue({ count: 1 });
    prisma.batchProjectItem.updateMany.mockResolvedValue({ count: 1 });
    credits.checkOrganizationCreditsAvailable.mockResolvedValue(true);
    credits.getOrganizationCreditsBalance.mockResolvedValue(2);
  });

  describe('start', () => {
    it('claims the draft at the quoted revision and queues one job per idea', async () => {
      await service.start(
        project({
          quote: quote([line('item-1'), line('item-2')], { total: 8 }),
        }) as never,
        pending as never,
        'quote-1',
        scope,
      );

      expect(credits.checkOrganizationCreditsAvailable).toHaveBeenCalledWith(
        'org-1',
        8,
      );
      expect(prisma.batchProject.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quote: expect.objectContaining({ acceptedAt: expect.any(String) }),
          status: BatchProjectStatus.GENERATING,
        }),
        where: expect.objectContaining({
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          revision: 3,
          status: BatchProjectStatus.DRAFT,
        }),
      });
      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dispatch: expect.objectContaining({
            key: 'batch-project-item:item-2:dispatch:1',
            state: 'queued',
          }),
          status: BatchProjectItemStatus.GENERATING,
        }),
        where: expect.objectContaining({
          id: 'item-2',
          status: BatchProjectItemStatus.PENDING,
        }),
      });
      expect(dispatcher.enqueue.mock.calls.map(([job]) => job.key)).toEqual([
        'batch-project-item:item-1:dispatch:1',
        'batch-project-item:item-2:dispatch:1',
      ]);
    });

    it('refuses with 402 when the balance cannot cover the quote', async () => {
      credits.checkOrganizationCreditsAvailable.mockResolvedValue(false);

      const error = await service
        .start(
          project({
            quote: quote([line('item-1'), line('item-2')], { total: 8 }),
          }) as never,
          pending as never,
          'quote-1',
          scope,
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(402);
      expect(prisma.batchProject.updateMany).not.toHaveBeenCalled();
      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });

    it('does not reserve or queue anything twice when start repeats', async () => {
      prisma.batchProject.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.start(project() as never, pending as never, 'quote-1', scope),
      ).rejects.toThrow(ConflictException);
      expect(dispatcher.enqueue).not.toHaveBeenCalled();

      await expect(
        service.start(
          project({
            quote: quote([line('item-1'), line('item-2')], {
              acceptedAt: new Date().toISOString(),
            }),
          }) as never,
          pending as never,
          'quote-1',
          scope,
        ),
      ).rejects.toThrow('This quote was already used');
      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });

    it.each([
      ['no quote id', undefined, project(), BadRequestException],
      ['another quote', 'quote-2', project(), BadRequestException],
      [
        'a stale revision',
        'quote-1',
        project({ revision: 4 }),
        ConflictException,
      ],
      [
        'an expired quote',
        'quote-1',
        project({
          quote: quote([line('item-1'), line('item-2')], {
            expiresAt: new Date(Date.now() - 1).toISOString(),
          }),
        }),
        ConflictException,
      ],
      [
        'a quote for other ideas',
        'quote-1',
        project({ quote: quote([line('item-1')]) }),
        ConflictException,
      ],
    ])('refuses %s', async (_label, quoteId, target, errorType) => {
      await expect(
        service.start(target as never, pending as never, quoteId, scope),
      ).rejects.toThrow(errorType);
      expect(prisma.batchProject.updateMany).not.toHaveBeenCalled();
      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });

    it('needs no platform credits when every line is billed to the org key', async () => {
      await service.start(
        project({
          quote: quote([
            line('item-1', { billingMode: 'byok', credits: 0 }),
            line('item-2', { billingMode: 'byok', credits: 0 }),
          ]),
        }) as never,
        pending as never,
        'quote-1',
        scope,
      );

      expect(credits.checkOrganizationCreditsAvailable).not.toHaveBeenCalled();
      expect(dispatcher.enqueue).toHaveBeenCalledTimes(2);
    });

    it('fails an idea whose job could not be queued', async () => {
      dispatcher.enqueue.mockRejectedValueOnce(new Error('Redis down'));

      await service.start(
        project() as never,
        pending as never,
        'quote-1',
        scope,
      );

      expect(dispatcher.failItem).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: 'item-1' }),
        'Generation could not be queued',
      );
      expect(dispatcher.enqueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry', () => {
    const failed = item('item-1', {
      retryCount: 1,
      status: BatchProjectItemStatus.FAILED,
    });
    const retryLine = line('item-1', {
      attempt: 2,
      key: 'batch-project-item:item-1:dispatch:2',
    });

    it('claims the failed idea with its next attempt, then queues it', async () => {
      await service.retry(
        project({
          quote: quote([retryLine], { total: 4 }),
          status: BatchProjectStatus.PARTIAL_FAILURE,
        }) as never,
        failed as never,
        'quote-1',
        scope,
      );

      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dispatch: expect.objectContaining({
            key: 'batch-project-item:item-1:dispatch:2',
            state: 'queued',
          }),
          retryCount: 2,
          status: BatchProjectItemStatus.GENERATING,
        }),
        where: expect.objectContaining({
          id: 'item-1',
          retryCount: 1,
          status: BatchProjectItemStatus.FAILED,
        }),
      });
      expect(
        prisma.batchProjectItem.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(dispatcher.enqueue.mock.invocationCallOrder[0]);
      expect(dispatcher.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'batch-project-item:item-1:dispatch:2',
        }),
      );
    });

    it('runs the first retry as a new attempt past the initial dispatch', async () => {
      const firstFailure = item('item-1', {
        dispatch: {
          attempt: 1,
          billingMode: 'platform',
          credits: 4,
          key: 'batch-project-item:item-1:dispatch:1',
          model: 'model-avatar',
          state: 'released',
        },
        retryCount: 0,
        status: BatchProjectItemStatus.FAILED,
      });

      await service.retry(
        project({
          quote: quote([retryLine], { total: 4 }),
          status: BatchProjectStatus.PARTIAL_FAILURE,
        }) as never,
        firstFailure as never,
        'quote-1',
        scope,
      );

      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dispatch: expect.objectContaining({
            attempt: 2,
            key: 'batch-project-item:item-1:dispatch:2',
          }),
          retryCount: 1,
        }),
        where: expect.objectContaining({ id: 'item-1', retryCount: 0 }),
      });
    });

    it('needs a quote line priced for the next attempt', async () => {
      await expect(
        service.retry(
          project({ quote: quote([line('item-1')]) }) as never,
          failed as never,
          'quote-1',
          scope,
        ),
      ).rejects.toThrow('The quote does not match');
      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });

    it('does not queue a retry another request already claimed', async () => {
      prisma.batchProjectItem.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.retry(
          project({ quote: quote([retryLine]) }) as never,
          failed as never,
          'quote-1',
          scope,
        ),
      ).rejects.toThrow(ConflictException);
      expect(dispatcher.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('quote', () => {
    it('prices every pending idea of a draft at the project revision', async () => {
      quotes.build.mockResolvedValue({ id: 'quote-new' });

      await service.quote(
        { ...project(), items: pending } as never,
        undefined,
        scope,
      );

      expect(quotes.build).toHaveBeenCalledWith({
        brandId: 'brand-1',
        userId: 'user-1',
        items: [
          { attempt: 1, item: pending[0] },
          { attempt: 1, item: pending[1] },
        ],
        organizationId: 'org-1',
        revision: 3,
      });
      expect(prisma.batchProject.updateMany).toHaveBeenCalledWith({
        data: { quote: { id: 'quote-new' } },
        where: expect.objectContaining({ id: 'project-1' }),
      });
    });

    it('prices a failed idea at the attempt after its last dispatch', async () => {
      const firstFailure = item('item-1', {
        dispatch: {
          attempt: 1,
          billingMode: 'platform',
          credits: 4,
          key: 'batch-project-item:item-1:dispatch:1',
          model: 'model-image',
          state: 'released',
        },
        status: BatchProjectItemStatus.FAILED,
      });
      quotes.build.mockResolvedValue({ id: 'quote-retry' });

      await service.quote(
        {
          ...project({ status: BatchProjectStatus.PARTIAL_FAILURE }),
          items: [firstFailure],
        } as never,
        ['item-1'],
        scope,
      );

      expect(quotes.build).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ attempt: 2, item: firstFailure }],
        }),
      );
    });

    it('prices one failed idea per retry quote', async () => {
      const failedItems = [
        item('item-1', { status: BatchProjectItemStatus.FAILED }),
        item('item-2', { status: BatchProjectItemStatus.FAILED }),
      ];

      await expect(
        service.quote(
          { ...project(), items: failedItems } as never,
          ['item-1', 'item-2'],
          scope,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(quotes.build).not.toHaveBeenCalled();
    });

    it('prices only failed ideas for a retry', async () => {
      await expect(
        service.quote(
          { ...project(), items: pending } as never,
          ['item-1'],
          scope,
        ),
      ).rejects.toThrow('Only failed ideas can be quoted for a retry');
    });
  });
});
