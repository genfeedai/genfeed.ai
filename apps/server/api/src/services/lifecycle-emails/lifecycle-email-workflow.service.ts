import { createGenfeedActionNode } from '@genfeedai/actions';
import type { LifecycleEmailWorkflowInput } from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';

export const LIFECYCLE_EMAIL_ACTION_ID = 'lifecycle-email.send';
export const LIFECYCLE_EMAIL_WORKFLOW_ID = 'lifecycle-email.delivery';

export function buildLifecycleEmailWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: LIFECYCLE_EMAIL_WORKFLOW_ID,
    definition: {
      edges: [],
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
          actionId: LIFECYCLE_EMAIL_ACTION_ID,
          id: 'send-email',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description: 'Delivers one scheduled lifecycle email.',
    label: 'Lifecycle Email Delivery',
    resultNodeId: 'send-email',
    version: 1,
  };
}

@Injectable()
export class LifecycleEmailWorkflowService implements OnModuleInit {
  constructor(
    private readonly delivery: LifecycleEmailDeliveryService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(LIFECYCLE_EMAIL_ACTION_ID, async ({ input }) => {
      await this.delivery.sendLifecycleEmail(
        input.request as LifecycleEmailWorkflowInput,
      );
      return { delivered: true };
    });
    this.runner.registerWorkflow(buildLifecycleEmailWorkflowDefinition());
  }

  async scheduleEmail(
    request: LifecycleEmailWorkflowInput & { organizationId: string },
    scheduledFor: Date,
  ): Promise<void> {
    const definition = buildLifecycleEmailWorkflowDefinition();
    const jobId = [
      'lifecycle-email',
      request.userId,
      request.sequence,
      request.step,
      request.triggerKey,
    ].join('-');
    await this.queue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
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
}
