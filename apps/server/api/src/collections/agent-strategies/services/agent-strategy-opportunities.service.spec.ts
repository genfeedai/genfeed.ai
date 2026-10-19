import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategyOpportunitiesService', () => {
  const count = vi.fn();
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const updateMany = vi.fn();
  const queryRaw = vi.fn().mockResolvedValue([]);
  const transaction = {
    $queryRaw: queryRaw,
    agentStrategyOpportunity: { create, findFirst, findMany, updateMany },
  };
  const service = new AgentStrategyOpportunitiesService(
    {
      agentStrategyOpportunity: {
        count,
        create,
        findFirst,
        findMany,
        updateMany,
      },
      $queryRaw: queryRaw,
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService,
    { log: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists every open row, newest first, when no page is asked for', async () => {
    findMany.mockResolvedValue([]);

    await service.listOpenByStrategy('strategy-1', 'org-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(findMany.mock.calls[0][0]).not.toHaveProperty('take');
  });

  describe('listOpenPageByStrategy', () => {
    const row = (id: string, priorityScore: number) => ({
      brandId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      data: { priorityScore, status: 'queued', topic: id },
      id,
      isDeleted: false,
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    it('ranks and windows ids in SQL, then hydrates only that page in rank order', async () => {
      queryRaw.mockResolvedValueOnce([{ id: 'b' }, { id: 'a' }]);
      count.mockResolvedValue(23);
      findMany.mockResolvedValue([row('a', 10), row('b', 90)]);

      const result = await service.listOpenPageByStrategy(
        'strategy-1',
        'org-1',
        { limit: 2, page: 3 },
      );

      const [statement] = queryRaw.mock.calls[0] as [
        { sql: string; values: unknown[] },
      ];
      expect(statement.sql).toContain('ORDER BY');
      expect(statement.sql).toContain('LIMIT');
      expect(statement.sql).toContain('OFFSET');
      expect(statement.values).toEqual(
        expect.arrayContaining(['org-1', 'strategy-1', 2, 4]),
      );
      expect(count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
          strategyId: 'strategy-1',
        }),
      });
      expect(findMany).toHaveBeenCalledWith({
        take: 2,
        where: {
          id: { in: ['b', 'a'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(result.docs.map((doc) => doc.id)).toEqual(['b', 'a']);
      expect(result.docs[0]).toMatchObject({
        organization: 'org-1',
        priorityScore: 90,
        strategy: 'strategy-1',
      });
      expect(result).toMatchObject({
        hasNextPage: true,
        limit: 2,
        page: 3,
        totalDocs: 23,
        totalPages: 12,
      });
    });

    it('skips the hydrate read when the page is empty', async () => {
      queryRaw.mockResolvedValueOnce([]);
      count.mockResolvedValue(3);

      const result = await service.listOpenPageByStrategy(
        'strategy-1',
        'org-1',
        { limit: 20, page: 5 },
      );

      expect(findMany).not.toHaveBeenCalled();
      expect(result.docs).toEqual([]);
      expect(result.totalDocs).toBe(3);
    });
  });

  it('filters requested statuses in the persistence query', async () => {
    findMany.mockResolvedValue([]);

    await service.listByStrategy('strategy-1', 'org-1', {
      statuses: ['approved', 'queued'],
    });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        isDeleted: false,
        OR: [
          { data: { equals: 'approved', path: ['status'] } },
          { data: { equals: 'queued', path: ['status'] } },
        ],
        organizationId: 'org-1',
        strategyId: 'strategy-1',
      },
    });
  });

  it('targets opportunity identity before deciding to create', async () => {
    findFirst.mockResolvedValue({
      createdAt: new Date(),
      data: { sourceRef: 'trend-1', sourceType: 'trend', topic: 'AI' },
      id: 'opportunity-1',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
    });

    const result = await service.createIfMissing({
      estimatedCreditCost: 5,
      expectedTrafficScore: 80,
      formatCandidates: ['post'],
      organizationId: 'org-1',
      platformCandidates: ['twitter'],
      priorityScore: 90,
      relevanceScore: 85,
      sourceRef: 'trend-1',
      sourceType: 'trend',
      strategyId: 'strategy-1',
      topic: 'AI',
    });

    expect(result.id).toBe('opportunity-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        AND: [
          { data: { equals: 'trend', path: ['sourceType'] } },
          { data: { equals: 'AI', path: ['topic'] } },
          { data: { equals: 'trend-1', path: ['sourceRef'] } },
        ],
        isDeleted: false,
        organizationId: 'org-1',
        strategyId: 'strategy-1',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });
  it('persists a selectable queued status for new opportunities', async () => {
    findFirst.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => ({
      ...data,
      id: 'new',
      createdAt: new Date(),
    }));
    const result = await service.createIfMissing({
      strategyId: 'strategy',
      organizationId: 'org',
      sourceType: 'evergreen',
      topic: 'Topic',
      platformCandidates: ['twitter'],
      formatCandidates: ['text'],
      relevanceScore: 80,
      expectedTrafficScore: 80,
      estimatedCreditCost: 5,
      priorityScore: 80,
    });
    expect(result.status).toBe('queued');
    expect(queryRaw).toHaveBeenCalled();
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
  });
  it('claims queued execution atomically and rejects a lost race', async () => {
    findFirst.mockResolvedValue({ data: { status: 'queued', topic: 'Topic' } });
    updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    expect(await service.claimForGeneration('opportunity', 'org')).toBe(true);
    expect(await service.claimForGeneration('opportunity', 'org')).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'opportunity',
          organizationId: 'org',
          isDeleted: false,
          data: { equals: 'queued', path: ['status'] },
        },
      }),
    );
  });
});
