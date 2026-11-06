import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type {
  AgentOrchestratorUiActionHost,
  ThreadUiActionExecutionParams,
} from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionPlanService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import type { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

describe('AgentOrchestratorUiActionPlanService', () => {
  const params = (
    payload: Record<string, unknown> = { planId: 'plan-1' },
  ): ThreadUiActionExecutionParams => ({
    context: {
      executionId: 'run-2',
      organizationId: 'org-1',
      userId: 'user-1',
    },
    model: 'test-model',
    payload,
    threadId: 'thread-1',
  });

  let latestPlan: Record<string, unknown> | undefined;
  let recordedPlans: Array<Record<string, unknown>>;
  let chargedRounds: string[];
  let executedLoops: Array<Record<string, unknown>>;
  let planModeRequests: Array<Record<string, unknown>>;
  let host: AgentOrchestratorUiActionHost;
  let service: AgentOrchestratorUiActionPlanService;

  beforeEach(() => {
    latestPlan = undefined;
    recordedPlans = [];
    chargedRounds = [];
    executedLoops = [];
    planModeRequests = [];

    const result = {
      creditsRemaining: 10,
      creditsUsed: 1,
      message: { content: 'Plan executed.', metadata: {}, role: 'assistant' },
      threadId: 'thread-1',
      toolCalls: [],
    };
    host = {
      executeSynchronousChatLoop: async (input: Record<string, unknown>) => {
        executedLoops.push(input);
        return result;
      },
      generatePlanModeResponse: async (input: Record<string, unknown>) => {
        planModeRequests.push(input);
        return result;
      },
    } as unknown as AgentOrchestratorUiActionHost;

    service = new AgentOrchestratorUiActionPlanService(
      {
        getRoundCredits: async (model: string) => {
          chargedRounds.push(model);
          return 1;
        },
      } as unknown as AgentChatModelRegistryService,
      {
        recordPlanUpserted: async (event: {
          plan: Record<string, unknown>;
        }) => {
          recordedPlans.push(event.plan);
        },
      } as unknown as AgentThreadEventRecorderService,
      {
        getSnapshot: async () => ({ latestProposedPlan: latestPlan }),
      } as unknown as AgentThreadEngineService,
    );
  });

  it('records and executes a plan that is still awaiting approval', async () => {
    latestPlan = {
      awaitingApproval: true,
      content: 'Step one',
      id: 'plan-1',
      status: 'awaiting_approval',
    };

    await expect(
      service.execute('approve_plan', params(), host),
    ).resolves.toMatchObject({ creditsUsed: 1 });

    const approvedPlan = expect.objectContaining({
      awaitingApproval: false,
      content: 'Step one',
      id: 'plan-1',
      lastReviewAction: 'approve',
      status: 'approved',
    });
    expect(recordedPlans).toEqual([approvedPlan]);
    expect(executedLoops).toEqual([
      expect.objectContaining({
        approvedPlan,
        request: expect.objectContaining({
          content: expect.stringContaining('Approved plan:\nStep one'),
        }),
        turnCost: 1,
      }),
    ]);
  });

  it.each([
    [
      'a plan that an earlier run already approved',
      {
        approvedAt: '2026-09-28T00:00:00.000Z',
        awaitingApproval: false,
        content: 'Step one',
        id: 'plan-1',
        lastReviewAction: 'approve',
        status: 'approved',
      },
      'This plan has already been approved.',
    ],
    ['a missing plan', undefined, 'No proposed plan is available to approve.'],
  ])(
    'rejects approving %s without executing or charging',
    async (_label, plan, message) => {
      latestPlan = plan;

      await expect(
        service.execute('approve_plan', params(), host),
      ).rejects.toThrow(new BadRequestException(message));
      expect(recordedPlans).toEqual([]);
      expect(executedLoops).toEqual([]);
      expect(chargedRounds).toEqual([]);
    },
  );

  it('asks for a revision with the feedback and the current plan', async () => {
    latestPlan = { content: 'Step one', id: 'plan-1' };

    await service.execute(
      'revise_plan',
      params({ revisionNote: '  Add a rollback step  ' }),
      host,
    );

    expect(planModeRequests).toEqual([
      expect.objectContaining({
        request: expect.objectContaining({
          content:
            'Revise the current implementation plan using this feedback: Add a rollback step',
          systemPromptOverride: 'Current proposed plan:\nStep one',
        }),
        reviewMetadata: {
          lastReviewAction: 'request_changes',
          revisionNote: 'Add a rollback step',
        },
      }),
    ]);
    expect(executedLoops).toEqual([]);
    expect(recordedPlans).toEqual([]);
  });
});
