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

  type GoalRow = typeof goalRow;
  type GoalWhere = {
    id?: string;
    isDeleted?: boolean;
    organizationId?: string;
  };
  let storedGoal: GoalRow;

  // Behaves like the table: only the live goal of the queried organization
  // is found or updated.
  function isStoredGoal(where: GoalWhere): boolean {
    return (
      where.id === storedGoal.id &&
      where.organizationId === storedGoal.organizationId &&
      where.isDeleted === false
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    storedGoal = { ...goalRow };
    agentGoal.findFirst.mockImplementation(
      async (args: { where: GoalWhere }) => {
        guard('findFirst', args);
        return isStoredGoal(args.where) ? storedGoal : null;
      },
    );
    agentGoal.update.mockImplementation(
      async (args: { data: Partial<GoalRow>; where: GoalWhere }) => {
        guard('update', args);
        if (!isStoredGoal(args.where)) {
          throw new Error('Record to update not found.');
        }
        storedGoal = { ...storedGoal, ...args.data };
        return storedGoal;
      },
    );
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

    expect(result).toMatchObject({
      config: { currentValue: 40, progressPercent: 40 },
      id: GOAL_ID,
    });
    expect(agentGoal.findUnique).not.toHaveBeenCalled();
  });

  it('does not return a goal that lives in another organization', async () => {
    storedGoal = { ...goalRow, organizationId: 'org_other' };

    await expect(
      runWithTenantContext({ organizationId: ORGANIZATION_ID }, () =>
        service.refreshProgress(GOAL_ID, ORGANIZATION_ID),
      ),
    ).rejects.toThrow();
    expect(storedGoal.config).toEqual(goalRow.config);
  });
});
