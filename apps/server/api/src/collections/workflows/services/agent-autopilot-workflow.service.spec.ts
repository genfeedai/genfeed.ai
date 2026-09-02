import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentAutopilotWorkflowService atomic actions', () => {
  it('discovers and resets one due credit window without iterating strategies internally', async () => {
    const config = {
      creditsUsedThisWeek: 8,
      dailyResetAt: '2020-01-01T00:00:00.000Z',
      weeklyResetAt: '2020-01-01T00:00:00.000Z',
    };
    // `isActive` scopes the query; discovery hands the graph a projected
    // snapshot, so the persisted row and the emitted item are not the same shape.
    const strategyRow = {
      brandId: null,
      config,
      goalId: null,
      id: 'strategy-1',
      isActive: true,
      label: null,
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const strategySnapshot = {
      config,
      id: 'strategy-1',
      organizationId: 'org-1',
      userId: 'user-1',
    };
    const prisma = {
      agentStrategy: {
        findMany: vi.fn().mockResolvedValue([strategyRow]),
        update: vi.fn().mockResolvedValue(strategyRow),
      },
    };
    const service = new AgentAutopilotWorkflowService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const discovery = await service.discoverCreditResetStrategies('org-1', {
      state: { acquired: true },
    });
    expect(discovery.items).toEqual([strategySnapshot]);

    await service.resetCreditWindow('org-1', {
      item: strategySnapshot,
      now: '2026-08-28T00:00:00.000Z',
    });
    expect(prisma.agentStrategy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'strategy-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});
