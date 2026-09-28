import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { AgentOrchestratorService } from '@api/services/agent-orchestrator/agent-orchestrator.service';
import type { AgentOrchestratorUiActionHost } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action.types';
import { AgentOrchestratorUiActionPlanService } from '@api/services/agent-orchestrator/agent-orchestrator-ui-action-plan.service';
import { AgentThreadEventRecorderService } from '@api/services/agent-orchestrator/agent-thread-event-recorder.service';
import type { AgentTurnAcceptanceService } from '@api/services/agent-orchestrator/agent-turn-acceptance.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentThreadEventDocument } from '@api/services/agent-threading/schemas/agent-thread-event.schema';
import type { AgentThreadSnapshotDocument } from '@api/services/agent-threading/schemas/agent-thread-snapshot.schema';
import type {
  AgentThreadEngineService,
  AppendAgentThreadEventParams,
} from '@api/services/agent-threading/services/agent-thread-engine.service';
import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import { deriveAgentUiActionStates } from '@genfeedai/contracts/interfaces';
import { describe, expect, it, vi } from 'vitest';

/**
 * The thread log with the real projector: commands dedupe by command id and
 * type, and each event is projected in sequence order.
 */
function createThreadLog() {
  const projector = new AgentThreadProjectorService();
  const commands = new Set<string>();
  let sequence = 0;
  let snapshot: Record<string, unknown> | null = null;
  const engine = {
    appendEvent: vi.fn(async (params: AppendAgentThreadEventParams) => {
      const key = `${params.type}:${params.commandId}`;
      if (!commands.has(key)) {
        commands.add(key);
        sequence += 1;
        snapshot = projector.applyEvent(
          snapshot as AgentThreadSnapshotDocument | null,
          {
            commandId: params.commandId,
            occurredAt: new Date().toISOString(),
            payload: params.payload,
            runId: params.runId,
            sequence,
            threadId: params.threadId,
            type: params.type,
          } as AgentThreadEventDocument,
        );
      }
      return {} as AgentThreadEventDocument;
    }),
    getSnapshot: vi.fn(async () => snapshot),
  };
  return engine as unknown as AgentThreadEngineService;
}

const context: AgentChatContext = { organizationId: 'org-1', userId: 'user-1' };
const threadId = 'thread-1';

describe('queued plan approvals', () => {
  it('executes a plan once when a second approval was queued before the first ran', async () => {
    const engine = createThreadLog();
    const recorder = new AgentThreadEventRecorderService(engine);
    const planService = new AgentOrchestratorUiActionPlanService(
      {
        getRoundCredits: vi.fn().mockResolvedValue(1),
      } as unknown as AgentChatModelRegistryService,
      recorder,
      engine,
    );
    const executions = ['exec-a', 'exec-b'];
    const orchestrator = new AgentOrchestratorService(
      {} as AgentTurnAcceptanceService,
      {
        enqueueWorkflow: vi.fn(async () => ({
          executionId: executions.shift(),
        })),
      } as unknown as SystemWorkflowRunnerService,
      recorder,
    );
    const executePlan = vi.fn(async (params: { context: AgentChatContext }) => {
      await recorder.recordRunCompleted({
        context: params.context,
        detail: 'Agent completed',
        runId: params.context.executionId,
        threadId,
      });
      return {
        creditsRemaining: 10,
        creditsUsed: 1,
        message: { content: 'Plan executed.', metadata: {}, role: 'assistant' },
        threadId,
        toolCalls: [],
      };
    });
    const host = {
      executeSynchronousChatLoop: executePlan,
    } as unknown as AgentOrchestratorUiActionHost;

    // An earlier plan-mode run proposed the plan.
    const planContext = { ...context, executionId: 'exec-plan' };
    await recorder.recordThreadTurnRequested({
      content: 'Plan it',
      context: planContext,
      runId: 'exec-plan',
      threadId,
    });
    await recorder.recordPlanUpserted({
      context: planContext,
      plan: {
        awaitingApproval: true,
        content: '1. Ship it',
        id: 'plan-1',
        status: 'awaiting_approval',
      },
      runId: 'exec-plan',
      threadId,
    });
    await recorder.recordRunCompleted({
      context: planContext,
      detail: 'Plan proposed',
      runId: 'exec-plan',
      threadId,
    });

    // Two approvals are acked before a worker starts either.
    const request = {
      action: 'approve_plan',
      payload: { planId: 'plan-1' },
      threadId,
    };
    await orchestrator.handleThreadUiAction(request, context);
    await orchestrator.handleThreadUiAction(request, context);

    // The worker runs them one at a time on the thread lane, recording each
    // run's start as the ui-action service does.
    const outcomes: string[] = [];
    for (const executionId of ['exec-a', 'exec-b']) {
      const runContext = { ...context, executionId };
      await recorder.recordThreadTurnRequested({
        content: 'Approved plan plan-1.',
        context: runContext,
        model: 'model',
        runId: executionId,
        threadId,
        uiAction: { action: 'approve_plan', sourceId: 'plan-1' },
      });
      await recorder.recordThreadTurnStarted({
        context: runContext,
        model: 'model',
        runId: executionId,
        threadId,
      });
      try {
        await planService.execute(
          'approve_plan',
          {
            context: runContext,
            model: 'model',
            payload: request.payload,
            threadId,
          },
          host,
        );
        outcomes.push('executed');
      } catch (error: unknown) {
        outcomes.push(error instanceof Error ? error.message : 'failed');
      }
    }

    expect(executePlan).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([
      'executed',
      'This plan has already been approved.',
    ]);
    const snapshot = await engine.getSnapshot(threadId, 'org-1', 'user-1');
    expect(snapshot.latestProposedPlan).toMatchObject({ status: 'approved' });

    // Both runs settle by their own terminal events; B's "already approved"
    // failure never overrides A's execution on the plan's card.
    await recorder.recordRunFailed({
      context: { ...context, executionId: 'exec-b' },
      error: outcomes[1] ?? '',
      runId: 'exec-b',
      threadId,
    });
    const settled = await engine.getSnapshot(threadId, 'org-1', 'user-1');
    expect(settled.uiActionRuns).toEqual([
      expect.objectContaining({ runId: 'exec-a', status: 'completed' }),
      expect.objectContaining({
        error: 'This plan has already been approved.',
        runId: 'exec-b',
        status: 'failed',
      }),
    ]);
    expect(
      deriveAgentUiActionStates(settled.uiActionRuns ?? [])[
        'approve_plan:plan-1'
      ],
    ).toMatchObject({ runId: 'exec-a', status: 'completed' });
  });
});
