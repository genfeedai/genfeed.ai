import { AgentGoalsService } from '@api/collections/agent-goals/services/agent-goals.service';
import type { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

const ORGANIZATION_ID = 'org_1';
const GOAL_ID = 'goal_1';

function guard(operation: string, args: unknown): void {
  assertTenantScopedQuery({
    args,
    isCloud: true,
    model: 'AgentGoal',
    operation,
    tenantModelNames: new Set(['AgentGoal']),
  });
}

describe('AgentGoalsService', () => {
  const goalRow = {
    brandId: null,
    config: { metric: 'views', targetValue: 100 },
    id: GOAL_ID,
    isDeleted: false,
    label: 'Reach',
    organizationId: ORGANIZATION_ID,
  };
  const agentGoal = {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const analyticsService = {
    getOverview: vi.fn(),
  };
  const loggerService = { warn: vi.fn() };
  const service = new AgentGoalsService(
    { agentGoal } as unknown as PrismaService,
    analyticsService as unknown as AnalyticsService,
    loggerService as unknown as LoggerService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    agentGoal.findFirst.mockImplementation(async (args) => {
      guard('findFirst', args);
      return goalRow;
    });
    agentGoal.update.mockImplementation(async (args) => {
      guard('update', args);
      return goalRow;
    });
    analyticsService.getOverview.mockResolvedValue({
      avgEngagementRate: 0,
      totalPosts: 0,
      totalViews: 40,
    });
  });

  it('refreshes progress and re-reads the goal inside the request organization (CLOUD tenant guard)', async () => {
    const result = await runWithTenantContext(
      { organizationId: ORGANIZATION_ID },
      () => service.refreshProgress(GOAL_ID, ORGANIZATION_ID),
    );

    expect(result).toMatchObject({ id: GOAL_ID });
    expect(agentGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          config: expect.objectContaining({
            currentValue: 40,
            progressPercent: 40,
          }),
        },
        where: {
          id: GOAL_ID,
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
        },
      }),
    );
    expect(agentGoal.findUnique).not.toHaveBeenCalled();
    expect(agentGoal.findFirst).toHaveBeenCalledTimes(2);
    for (const [args] of agentGoal.findFirst.mock.calls) {
      expect(args.where).toMatchObject({
        id: GOAL_ID,
        isDeleted: false,
        organizationId: ORGANIZATION_ID,
      });
    }
  });

  it('does not return a goal that lives in another organization', async () => {
    agentGoal.findFirst.mockImplementation(async (args) => {
      guard('findFirst', args);
      return null;
    });

    await expect(
      runWithTenantContext({ organizationId: ORGANIZATION_ID }, () =>
        service.refreshProgress(GOAL_ID, ORGANIZATION_ID),
      ),
    ).rejects.toThrow();
    expect(agentGoal.update).not.toHaveBeenCalled();
  });
});
