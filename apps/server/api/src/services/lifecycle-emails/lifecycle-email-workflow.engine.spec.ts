import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type {
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import type {
  LifecycleEmailDeliveryService,
  LifecycleEmailDeliveryState,
} from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import {
  LIFECYCLE_EMAIL_WORKFLOW_DEFINITION,
  LifecycleEmailWorkflowService,
} from '@api/services/lifecycle-emails/lifecycle-email-workflow.service';
import {
  buildActionExecutionInput,
  WorkflowEngine,
} from '@genfeedai/workflows/engine';
import { describe, expect, it, vi } from 'vitest';

/**
 * Runs the registered lifecycle-email graph through the real converter and
 * engine, so every node's published input and output contract is validated
 * exactly as in production. Only the delivery service I/O is stubbed.
 */

const request = {
  sequence: 'welcome' as const,
  step: 'welcome-day-0' as const,
  triggerKey: 'signup-user-1',
  userId: 'user-1',
};
const loadedState: LifecycleEmailDeliveryState = {
  delivery: {
    email: 'owner@example.com',
    id: 'delivery-1',
    metadata: { organizationId: 'org-1' },
    scheduledFor: '2026-08-28T00:00:00.000Z',
    sequence: request.sequence,
    status: 'scheduled',
    step: request.step,
    triggerKey: request.triggerKey,
    user: {
      email: 'owner@example.com',
      firstName: 'Vincent',
      id: request.userId,
      isDeleted: false,
    },
  },
  request,
};

async function runDelivery(failingNodeId: string) {
  const fail = () => {
    throw new Error(`${failingNodeId} failed`);
  };
  const delivery = {
    checkLifecycleEligibility: vi.fn((state: LifecycleEmailDeliveryState) =>
      failingNodeId === 'check-eligibility' ? fail() : state,
    ),
    deliverLifecycleEmail: vi.fn((state: LifecycleEmailDeliveryState) =>
      failingNodeId === 'deliver-email' ? fail() : state,
    ),
    finalizeLifecycleDelivery: vi.fn().mockResolvedValue({ delivered: false }),
    loadLifecycleDelivery: vi.fn().mockResolvedValue(loadedState),
    renderLifecycleDelivery: vi.fn((state: LifecycleEmailDeliveryState) =>
      failingNodeId === 'render-email' ? fail() : state,
    ),
  };

  const engine = new WorkflowEngine({ maxConcurrency: 1 });
  const runner = {
    registerAction: (
      actionId: string,
      executor: SystemWorkflowActionExecutor,
    ) => {
      engine.registerExecutor(actionId, async (node, inputs, context) =>
        executor({
          context,
          input: buildActionExecutionInput(node.config, inputs),
          provenance: {
            executionId: context.runId,
            idempotencyKey: `workflow:${context.runId}:${node.id}`,
            nodeId: node.id,
            workflowId: context.workflowId,
            workflowLabel: LIFECYCLE_EMAIL_WORKFLOW_DEFINITION.label,
          },
        }),
      );
    },
    registerWorkflow: vi.fn(),
  };
  new LifecycleEmailWorkflowService(
    delivery as unknown as LifecycleEmailDeliveryService,
    {} as WorkflowExecutionQueueService,
    runner as unknown as SystemWorkflowRunnerService,
  ).onModuleInit();

  const converter = new WorkflowEngineConverterService();
  const { definition } = LIFECYCLE_EMAIL_WORKFLOW_DEFINITION;
  const document = {
    edges: definition.edges,
    id: LIFECYCLE_EMAIL_WORKFLOW_DEFINITION.canonicalId,
    inputVariables: definition.inputVariables ?? [],
    nodes: definition.nodes,
    organizationId: 'org-1',
    userId: request.userId,
    versionId: 'lifecycle-email-version',
  };
  const executable = converter.applyRuntimeInputValues(
    document,
    converter.convertToExecutableWorkflow(document),
    { request },
  );

  const result = await engine.execute(executable, { maxRetries: 0 });
  return { delivery, result };
}

describe('lifecycle email workflow engine execution', () => {
  it.each(['check-eligibility', 'render-email', 'deliver-email'])(
    'finalizes the delivery as failed when %s fails',
    async (failingNodeId) => {
      const { delivery, result } = await runDelivery(failingNodeId);

      // The engine's failure envelope must pass the finalize input contract,
      // otherwise the row is never marked failed.
      expect(result.nodeResults.get('finalize-delivery')).toMatchObject({
        status: 'completed',
      });
      expect(delivery.finalizeLifecycleDelivery).toHaveBeenCalledWith(
        loadedState,
        `${failingNodeId} failed`,
      );
    },
  );
});
