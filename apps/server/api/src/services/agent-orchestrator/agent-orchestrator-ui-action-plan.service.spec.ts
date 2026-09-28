import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  AgentOrchestratorUiActionHost,
  ThreadUiActionExecutionParams,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionPlanService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentOrchestratorUiActionPlanService approve_plan', () => {
  const params = (): ThreadUiActionExecutionParams => ({
    context: {
      executionId: 'run-2',
      organizationId: 'org-1',
      userId: 'user-1',
    },
    model: 'test-model',
    payload: { planId: 'plan-1' },
    threadId: 'thread-1',
  });
  const recorder = { recordPlanUpserted: vi.fn() };
  const registry = { getRoundCredits: vi.fn() };
  const engine = { getSnapshot: vi.fn() };
  const host = { executeSynchronousChatLoop: vi.fn() };
  let service: AgentOrchestratorUiActionPlanService;

  beforeEach(() => {
    vi.clearAllMocks();
    registry.getRoundCredits.mockResolvedValue(1);
    host.executeSynchronousChatLoop.mockResolvedValue({
      creditsRemaining: 10,
      creditsUsed: 1,
      message: { content: 'Plan executed.', metadata: {}, role: 'assistant' },
      threadId: 'thread-1',
      toolCalls: [],
    });
    service = new AgentOrchestratorUiActionPlanService(
      registry as unknown as AgentChatModelRegistryService,
      recorder as unknown as AgentThreadEventRecorderService,
      engine as unknown as AgentThreadEngineService,
    );
  });

  it('executes a plan that is still awaiting approval', async () => {
    engine.getSnapshot.mockResolvedValue({
      latestProposedPlan: {
        awaitingApproval: true,
        content: 'Step one',
        id: 'plan-1',
        status: 'awaiting_approval',
      },
    });

    await service.execute(
      'approve_plan',
      params(),
      host as unknown as AgentOrchestratorUiActionHost,
    );

    expect(recorder.recordPlanUpserted).toHaveBeenCalledTimes(1);
    expect(host.executeSynchronousChatLoop).toHaveBeenCalledTimes(1);
    expect(host.executeSynchronousChatLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedPlan: expect.objectContaining({
          awaitingApproval: false,
          content: 'Step one',
          id: 'plan-1',
          lastReviewAction: 'approve',
          status: 'approved',
        }),
      }),
    );
  });

  it('rejects approving a plan that an earlier run already approved, without executing or charging again', async () => {
    engine.getSnapshot.mockResolvedValue({
      latestProposedPlan: {
        approvedAt: '2026-09-28T00:00:00.000Z',
        awaitingApproval: false,
        content: 'Step one',
        id: 'plan-1',
        lastReviewAction: 'approve',
        status: 'approved',
      },
    });

    await expect(
      service.execute(
        'approve_plan',
        params(),
        host as unknown as AgentOrchestratorUiActionHost,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(recorder.recordPlanUpserted).not.toHaveBeenCalled();
    expect(host.executeSynchronousChatLoop).not.toHaveBeenCalled();
    expect(registry.getRoundCredits).not.toHaveBeenCalled();
  });
});
