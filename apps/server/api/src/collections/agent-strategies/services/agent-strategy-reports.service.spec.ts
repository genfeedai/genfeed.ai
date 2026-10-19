import { AgentStrategyReportsService } from '@api/collections/agent-strategies/services/agent-strategy-reports.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('AgentStrategyReportsService', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const service = new AgentStrategyReportsService(
    { agentStrategyReport: { count, findMany } } as unknown as PrismaService,
    { log: vi.fn() } as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
  });

  it('filters report type in the persistence query', async () => {
    await service.listByStrategy(
      'strategy-1',
      'org-1',
      { limit: 20, page: 1 },
      'weekly',
    );

    const where = {
      data: { equals: 'weekly', path: ['reportType'] },
      isDeleted: false,
      organizationId: 'org-1',
      strategyId: 'strategy-1',
    };
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('pages in SQL, newest first, and reports the totals', async () => {
    findMany.mockResolvedValue([
      { data: { reportType: 'daily' }, id: 'report-21' },
    ]);
    count.mockResolvedValue(21);

    const result = await service.listByStrategy('strategy-1', 'org-1', {
      limit: 20,
      page: 2,
    });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 20,
      take: 20,
      where: {
        isDeleted: false,
        organizationId: 'org-1',
        strategyId: 'strategy-1',
      },
    });
    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      limit: 20,
      page: 2,
      totalDocs: 21,
      totalPages: 2,
    });
    expect(result.docs).toHaveLength(1);
  });

  it('reads the latest report as a single-row page', async () => {
    findMany.mockResolvedValue([{ data: {}, id: 'report-1' }]);
    count.mockResolvedValue(5);

    const latest = await service.getLatest('strategy-1', 'org-1');

    expect(latest?.id).toBe('report-1');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 }),
    );
  });
});
