import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategyOpportunitiesService', () => {
  const create = vi.fn();
  const findFirst = vi.fn();
  const findMany = vi.fn();
  const service = new AgentStrategyOpportunitiesService(
    {
      agentStrategyOpportunity: { create, findFirst, findMany },
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
});
