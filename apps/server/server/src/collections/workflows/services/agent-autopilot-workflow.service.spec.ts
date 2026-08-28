import { AgentAutopilotWorkflowService } from '@server/collections/workflows/services/agent-autopilot-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('AgentAutopilotWorkflowService atomic actions', () => {
  it('discovers and resets one due credit window without iterating strategies internally', async () => {
    const strategy = {
      config: {
        creditsUsedThisWeek: 8,
        dailyResetAt: '2020-01-01T00:00:00.000Z',
        weeklyResetAt: '2020-01-01T00:00:00.000Z',
      },
      id: 'strategy-1',
      isActive: true,
      organizationId: 'org-1',
    };
    const prisma = {
      agentStrategy: {
        findMany: vi.fn().mockResolvedValue([strategy]),
        update: vi.fn().mockResolvedValue(strategy),
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
    expect(discovery.items).toEqual([strategy]);

    await service.resetCreditWindow('org-1', {
      item: strategy,
      now: '2026-08-28T00:00:00.000Z',
    });
    expect(prisma.agentStrategy.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'strategy-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});
