import type { AgentThreadsService } from '@api/collections/agent-threads/services/agent-threads.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { AgentThreadEngineService } from '@api/services/agent-threading/services/agent-thread-engine.service';
import { WorkflowExecutionTrigger } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgentRuntimeService } from './agent-runtime.service';

interface EnqueuedWorkflow {
  options: unknown;
  workflow: Record<string, unknown>;
}

describe('AgentRuntimeService', () => {
  let threads: Array<Record<string, unknown>>;
  let enqueued: EnqueuedWorkflow[];
  let events: Array<Record<string, unknown>>;
  let isEventStoreDown: boolean;
  let warnings: string[];
  let service: AgentRuntimeService;

  const minimalTurn = {
    dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
    label: 'Campaign run',
    objective: 'Grow engagement',
    organizationId: 'org-1',
    strategyId: 'strategy-1',
    trigger: WorkflowExecutionTrigger.SCHEDULED,
    userId: 'user-1',
  };

  beforeEach(() => {
    threads = [];
    enqueued = [];
    events = [];
    isEventStoreDown = false;
    warnings = [];

    service = new AgentRuntimeService(
      {
        log: () => undefined,
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      {
        create: async (input: Record<string, unknown>) => {
          const thread = { ...input, id: `thread-${threads.length + 1}` };
          threads.push(thread);
          return thread;
        },
      } as unknown as AgentThreadsService,
      {
        enqueueWorkflow: async (
          workflow: Record<string, unknown>,
          options: unknown,
        ) => {
          enqueued.push({ options, workflow });
          return { executionId: `execution-${enqueued.length}` };
        },
      } as unknown as SystemWorkflowRunnerService,
      {
        appendEvent: async (event: Record<string, unknown>) => {
          if (isEventStoreDown) {
            throw new Error('append failed');
          }
          events.push(event);
        },
      } as unknown as AgentThreadEngineService,
    );
  });

  it('startTurn creates a thread, enqueues the agent-turn workflow, and appends turn_requested', async () => {
    const handle = await service.startTurn({
      agentType: 'general',
      autonomyMode: 'supervised',
      brandId: 'brand-1',
      campaignId: 'campaign-1',
      creditBudget: 12,
      dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      label: 'Campaign run: Spring Push - Specialist',
      metadata: { clientRequestId: 'client-1' },
      model: 'openai/gpt-5.6-terra',
      objective: 'Grow engagement',
      organizationId: 'org-1',
      strategyId: 'strategy-1',
      threadTitle: 'Spring Push · Specialist',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: 'user-1',
    });

    expect(handle).toEqual({
      executionId: 'execution-1',
      threadId: 'thread-1',
    });
    expect(threads).toEqual([
      expect.objectContaining({
        organizationId: 'org-1',
        source: 'campaign',
        title: 'Spring Push · Specialist',
        userId: 'user-1',
      }),
    ]);
    expect(enqueued).toEqual([
      {
        options: { dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE },
        workflow: expect.objectContaining({
          actionType: 'agent.turn.execute',
          canonicalId: 'agent.turn.execute',
          // The turn is deduped on the caller-supplied client request id, so a
          // retried enqueue rejoins the execution it already created.
          idempotencyKey: 'agent.turn.execute:org-1:user-1:client-1',
          inputValues: {
            request: expect.objectContaining({
              agentType: 'general',
              brandId: 'brand-1',
              campaignId: 'campaign-1',
              content: 'Grow engagement',
              creditBudget: 12,
              strategyId: 'strategy-1',
              threadId: 'thread-1',
            }),
          },
          metadata: expect.objectContaining({
            source: 'campaign',
            threadId: 'thread-1',
          }),
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      },
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        commandId: 'turn-requested:execution-1',
        organizationId: 'org-1',
        threadId: 'thread-1',
        type: 'thread.turn_requested',
        userId: 'user-1',
      }),
    ]);
  });

  it('startTurn omits the idempotency key when no client request id is supplied', async () => {
    await service.startTurn(minimalTurn);

    expect(enqueued[0]?.workflow).not.toHaveProperty('idempotencyKey');
    expect(enqueued[0]?.options).toEqual({
      dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
    });
  });

  it('startTurn continues when thread event append fails', async () => {
    isEventStoreDown = true;

    const handle = await service.startTurn(minimalTurn);

    expect(handle).toEqual({
      executionId: 'execution-1',
      threadId: 'thread-1',
    });
    expect(events).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
