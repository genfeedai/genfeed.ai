import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import {
  LifecycleEmailDeliveryService,
  type LifecycleEmailDeliveryState,
} from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { LifecycleEmailWorkflowInput } from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export const LIFECYCLE_EMAIL_ACTION_IDS = {
  CHECK: 'lifecycle-email.check-eligibility',
  DELIVER: 'lifecycle-email.deliver',
  FINALIZE: 'lifecycle-email.finalize',
  LOAD: 'lifecycle-email.load-delivery',
  RENDER: 'lifecycle-email.render',
} as const;
export const LIFECYCLE_EMAIL_WORKFLOW_ID = 'lifecycle-email.delivery';

export function buildLifecycleEmailWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: LIFECYCLE_EMAIL_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'load-check',
          source: 'load-delivery',
          target: 'check-eligibility',
          targetHandle: 'state',
        },
        {
          id: 'check-render',
          source: 'check-eligibility',
          target: 'render-email',
          targetHandle: 'state',
        },
        {
          id: 'render-deliver',
          source: 'render-email',
          target: 'deliver-email',
          targetHandle: 'state',
        },
        {
          id: 'deliver-finalize',
          source: 'deliver-email',
          target: 'finalize-delivery',
          targetHandle: 'state',
        },
        {
          id: 'check-failure',
          source: 'check-eligibility',
          sourceHandle: 'failure',
          target: 'finalize-delivery',
          targetHandle: 'failure',
        },
        {
          id: 'render-failure',
          source: 'render-email',
          sourceHandle: 'failure',
          target: 'finalize-delivery',
          targetHandle: 'failure',
        },
        {
          id: 'deliver-failure',
          source: 'deliver-email',
          sourceHandle: 'failure',
          target: 'finalize-delivery',
          targetHandle: 'failure',
        },
      ],
      inputVariables: [
        {
          key: 'request',
          label: 'Lifecycle email',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: LIFECYCLE_EMAIL_ACTION_IDS.LOAD,
          id: 'load-delivery',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: LIFECYCLE_EMAIL_ACTION_IDS.CHECK,
          id: 'check-eligibility',
        }),
        createGenfeedActionNode({
          actionId: LIFECYCLE_EMAIL_ACTION_IDS.RENDER,
          id: 'render-email',
        }),
        createGenfeedActionNode({
          actionId: LIFECYCLE_EMAIL_ACTION_IDS.DELIVER,
          id: 'deliver-email',
        }),
        createGenfeedActionNode({
          actionId: LIFECYCLE_EMAIL_ACTION_IDS.FINALIZE,
          id: 'finalize-delivery',
        }),
      ],
    },
    description:
      'Loads, checks, renders, delivers, and finalizes one lifecycle email.',
    label: 'Lifecycle Email Delivery',
    resultNodeId: 'finalize-delivery',
    version: 1,
  };
}

export const LIFECYCLE_EMAIL_WORKFLOW_DEFINITION =
  buildLifecycleEmailWorkflowDefinition();

@Injectable()
export class LifecycleEmailWorkflowService implements OnModuleInit {
  constructor(
    private readonly delivery: LifecycleEmailDeliveryService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(LIFECYCLE_EMAIL_ACTION_IDS.LOAD, ({ input }) =>
      this.delivery.loadLifecycleDelivery(
        input.request as LifecycleEmailWorkflowInput,
      ),
    );
    this.runner.registerAction(LIFECYCLE_EMAIL_ACTION_IDS.CHECK, ({ input }) =>
      this.delivery.checkLifecycleEligibility(
        input.state as LifecycleEmailDeliveryState,
      ),
    );
    this.runner.registerAction(LIFECYCLE_EMAIL_ACTION_IDS.RENDER, ({ input }) =>
      this.delivery.renderLifecycleDelivery(
        input.state as LifecycleEmailDeliveryState,
      ),
    );
    this.runner.registerAction(
      LIFECYCLE_EMAIL_ACTION_IDS.DELIVER,
      ({ input }) =>
        this.delivery.deliverLifecycleEmail(
          input.state as LifecycleEmailDeliveryState,
        ),
    );
    this.runner.registerAction(
      LIFECYCLE_EMAIL_ACTION_IDS.FINALIZE,
      ({ input }) => {
        const failure = input.failure as
          | { error?: string; nodeOutputs?: Record<string, unknown> }
          | undefined;
        const state =
          (input.state as LifecycleEmailDeliveryState | undefined) ??
          this.lastState(failure?.nodeOutputs);
        return this.delivery.finalizeLifecycleDelivery(state, failure?.error);
      },
    );
    this.runner.registerWorkflow(LIFECYCLE_EMAIL_WORKFLOW_DEFINITION);
  }

  async scheduleEmail(
    request: LifecycleEmailWorkflowInput & { organizationId: string },
    scheduledFor: Date,
  ): Promise<void> {
    const jobId = [
      'lifecycle-email',
      request.userId,
      request.sequence,
      request.step,
      request.triggerKey,
    ].join('-');
    await this.queue.queueSystemWorkflow(
      {
        actionType: LIFECYCLE_EMAIL_WORKFLOW_DEFINITION.canonicalId,
        canonicalId: LIFECYCLE_EMAIL_WORKFLOW_DEFINITION.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'lifecycle-email',
        userId: request.userId,
      },
      jobId,
      {
        attempts: 3,
        delayMs: Math.max(0, scheduledFor.getTime() - Date.now()),
        replaceTerminalJob: true,
      },
    );
  }

  private lastState(
    outputs: Record<string, unknown> | undefined,
  ): LifecycleEmailDeliveryState | undefined {
    if (!outputs) return undefined;
    for (const id of [
      'deliver-email',
      'render-email',
      'check-eligibility',
      'load-delivery',
    ]) {
      const value = outputs[id];
      if (value && typeof value === 'object')
        return value as LifecycleEmailDeliveryState;
    }
    return undefined;
  }
}
