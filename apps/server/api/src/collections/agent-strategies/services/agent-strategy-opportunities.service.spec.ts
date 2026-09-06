import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategyOpportunitiesService', () => {
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
      agentStrategyOpportunity: { create, findFirst, findMany, updateMany },
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
