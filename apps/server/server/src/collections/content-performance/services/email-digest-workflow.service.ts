import { createGenfeedActionNode } from '@genfeedai/actions';
import type { EmailDigestWorkflowInput } from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { EmailDigestResult } from '@server/collections/content-performance/services/email-digest.service';
import { EmailDigestService } from '@server/collections/content-performance/services/email-digest.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';

export const EMAIL_DIGEST_ACTION_ID = 'email-digest.send';
export const EMAIL_DIGEST_WORKFLOW_ID = 'email-digest.delivery';

export function buildEmailDigestWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: EMAIL_DIGEST_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'request',
          label: 'Digest request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: EMAIL_DIGEST_ACTION_ID,
          id: 'send-digest',
          inputVariableKeys: ['request'],
        }),
      ],
    },
    description: 'Builds and sends one performance email digest.',
    label: 'Email Digest Delivery',
    resultNodeId: 'send-digest',
    version: 1,
  };
}

@Injectable()
export class EmailDigestWorkflowService implements OnModuleInit {
  constructor(
    private readonly digest: EmailDigestService,
    private readonly queue: WorkflowExecutionQueueService,
    private readonly runner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.runner.registerAction(EMAIL_DIGEST_ACTION_ID, ({ input }) =>
      this.digest.sendDigest(input.request as EmailDigestWorkflowInput),
    );
    this.runner.registerWorkflow(buildEmailDigestWorkflowDefinition());
  }

  enqueue(request: EmailDigestWorkflowInput): Promise<string> {
    const definition = buildEmailDigestWorkflowDefinition();
    const range = `${request.startDate ?? 'default'}-${request.endDate ?? 'default'}`;
    return this.queue.queueSystemWorkflowDefinition(
      definition,
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'content-performance',
        userId: request.userId,
      },
      `email-digest-${request.organizationId}-${request.brandId}-${range}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  async run(request: EmailDigestWorkflowInput): Promise<EmailDigestResult> {
    const definition = buildEmailDigestWorkflowDefinition();
    const { result } =
      await this.runner.runWorkflowDefinition<EmailDigestResult>(definition, {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request },
        organizationId: request.organizationId,
        source: 'content-performance',
        userId: request.userId,
      });
    return result;
  }
}
