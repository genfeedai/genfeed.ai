import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategyReportsService', () => {
  const findMany = vi.fn();
  const service = new AgentStrategyReportsService(
    { agentStrategyReport: { findMany } } as unknown as PrismaService,
    { log: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters report type in the persistence query', async () => {
    findMany.mockResolvedValue([]);

    await service.listByStrategy('strategy-1', 'org-1', 'weekly');

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      where: {
        data: { equals: 'weekly', path: ['reportType'] },
        isDeleted: false,
        organizationId: 'org-1',
        strategyId: 'strategy-1',
      },
    });
  });
});
