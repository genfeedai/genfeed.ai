import type {
  EmailDigestPrepared,
  EmailDigestRendered,
  EmailDigestResult,
} from '@api/collections/content-performance/services/email-digest.service';
import { EmailDigestService } from '@api/collections/content-performance/services/email-digest.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowGraphDefinition,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';
import type { EmailDigestWorkflowInput } from '@genfeedai/interfaces';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export const EMAIL_DIGEST_ACTION_IDS = {
  DELIVER: 'email-digest.deliver-recipient',
  DISCOVER: 'email-digest.discover-recipients',
  FINALIZE: 'email-digest.finalize',
  PREPARE: 'email-digest.prepare',
  RENDER: 'email-digest.render',
} as const;
export const EMAIL_DIGEST_WORKFLOW_ID = 'email-digest.delivery';
export const EMAIL_DIGEST_CHILD_WORKFLOW_ID = 'email-digest.deliver-one';

export function buildEmailDigestChildWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: EMAIL_DIGEST_CHILD_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'delivery',
          label: 'Recipient delivery',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: EMAIL_DIGEST_ACTION_IDS.DELIVER,
          id: 'deliver-recipient',
          inputVariableKeys: ['delivery'],
        }),
      ],
    },
    description: 'Delivers one rendered digest to one recipient.',
    label: 'Email Digest Recipient Delivery',
    resultNodeId: 'deliver-recipient',
    version: 1,
  };
}

export function buildEmailDigestWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: EMAIL_DIGEST_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'prepare-discover',
          source: 'prepare-digest',
          target: 'discover-recipients',
          targetHandle: 'prepared',
        },
        {
          id: 'discover-render',
          source: 'discover-recipients',
          target: 'render-digest',
          targetHandle: 'state',
        },
        {
          id: 'render-deliveries',
          source: 'render-digest',
          sourceHandle: 'deliveries',
          target: 'deliver-recipients',
          targetHandle: 'items',
        },
        {
          id: 'render-finalize',
          source: 'render-digest',
          target: 'finalize-digest',
          targetHandle: 'rendered',
        },
        {
          id: 'deliver-finalize',
          source: 'deliver-recipients',
          target: 'finalize-digest',
          targetHandle: 'dispatch',
        },
      ],
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
          actionId: EMAIL_DIGEST_ACTION_IDS.PREPARE,
          id: 'prepare-digest',
          inputVariableKeys: ['request'],
        }),
        createGenfeedActionNode({
          actionId: EMAIL_DIGEST_ACTION_IDS.DISCOVER,
          id: 'discover-recipients',
        }),
        createGenfeedActionNode({
          actionId: EMAIL_DIGEST_ACTION_IDS.RENDER,
          id: 'render-digest',
        }),
        createGenfeedActionNode({
          actionId: 'workflow.for-each',
          id: 'deliver-recipients',
          parameters: {
            childWorkflowId: EMAIL_DIGEST_CHILD_WORKFLOW_ID,
            itemInputKey: 'delivery',
            maxConcurrency: 5,
            mode: 'await',
          },
        }),
        createGenfeedActionNode({
          actionId: EMAIL_DIGEST_ACTION_IDS.FINALIZE,
          id: 'finalize-digest',
        }),
      ],
    },
    description: 'Prepares, renders, and fans out a performance digest.',
    label: 'Email Digest Delivery',
    resultNodeId: 'finalize-digest',
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
    this.runner.registerAction(EMAIL_DIGEST_ACTION_IDS.PREPARE, ({ input }) =>
      this.digest.prepareDigest(input.request as EmailDigestWorkflowInput),
    );
    this.runner.registerAction(EMAIL_DIGEST_ACTION_IDS.DISCOVER, ({ input }) =>
      this.digest.discoverDigestRecipients(
        input.prepared as EmailDigestPrepared,
      ),
    );
    this.runner.registerAction(EMAIL_DIGEST_ACTION_IDS.RENDER, ({ input }) =>
      this.digest.renderDigest(
        input.state as EmailDigestPrepared & { recipients: string[] },
      ),
    );
    this.runner.registerAction(EMAIL_DIGEST_ACTION_IDS.DELIVER, ({ input }) =>
      this.digest.deliverDigestRecipient(
        input.delivery as { email: string; html: string; subject: string },
      ),
    );
    this.runner.registerAction(EMAIL_DIGEST_ACTION_IDS.FINALIZE, ({ input }) =>
      this.finalize(
        input.rendered as EmailDigestRendered,
        input.dispatch as { results?: Array<{ result?: { sent?: boolean } }> },
      ),
    );
    this.runner.registerWorkflow(buildEmailDigestChildWorkflowDefinition());
    this.runner.registerWorkflow(buildEmailDigestWorkflowDefinition());
  }

  enqueue(request: EmailDigestWorkflowInput): Promise<string> {
    const definition = buildEmailDigestWorkflowDefinition();
    const range = `${request.startDate ?? 'default'}-${request.endDate ?? 'default'}`;
    return this.queue.queueSystemWorkflow(
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
    const { result } = await this.runner.runWorkflow<EmailDigestResult>({
      actionType: EMAIL_DIGEST_WORKFLOW_ID,
      canonicalId: EMAIL_DIGEST_WORKFLOW_ID,
      inputValues: { request },
      organizationId: request.organizationId,
      source: 'content-performance',
      userId: request.userId,
    });
    return result;
  }

  private finalize(
    rendered: EmailDigestRendered,
    dispatch: { results?: Array<{ result?: { sent?: boolean } }> },
  ): EmailDigestResult {
    const results = dispatch?.results ?? [];
    const sent = results.filter((entry) => entry.result?.sent === true).length;
    const errors = results.length - sent;
    return {
      errors,
      sent,
      skipped: rendered.deliveries.length === 0 ? 1 : 0,
    };
  }
}
