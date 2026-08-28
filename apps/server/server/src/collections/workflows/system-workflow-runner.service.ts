import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { WorkflowEngineAdapterService } from '@server/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutorService } from '@server/collections/workflows/services/workflow-executor.service';
import {
  buildSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@server/collections/workflows/system-workflow.contract';
import { createVersionedWorkflow } from '@server/collections/workflows/workflow-version-definition';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

export const SYSTEM_WORKFLOW_ACTION_IDS = {
  BRAND_REMIX_PAUSED_META_DRAFT: 'brand-remix-paused-meta-draft',
  BRAND_REMIX_PAUSED_X_ADS_DRAFT: 'brand-remix-paused-x-ads-draft',
  BRAND_REMIX_REVIEW_HANDOFF: 'brand-remix-review-handoff',
  CAMPAIGN_DM_AUTOMATION: 'campaign-dm-automation',
  CAMPAIGN_REPLY_AUTOMATION: 'campaign-reply-automation',
  EVERGREEN_RELEASE_EXPANSION: 'evergreen-release-expansion',
  REPLY_DM_AUTOMATION: 'reply-dm-automation',
  REVIEW_GATE_TIMEOUT: 'review-gate-timeout',
  SCHEDULED_POST_PUBLISHING: 'scheduled-post-publishing',
  SOCIAL_REPLY_CAMPAIGN: 'social-reply-campaign',
  STREAK_MAINTENANCE: 'streak-maintenance',
  TIKTOK_STATUS_RECONCILIATION: 'tiktok-status-reconciliation',
  TWITTER_PUBLISH_ACTION: 'twitter-publish-action',
  YOUTUBE_STATUS_RECONCILIATION: 'youtube-status-reconciliation',
} as const;

export type SystemWorkflowActionId =
  (typeof SYSTEM_WORKFLOW_ACTION_IDS)[keyof typeof SYSTEM_WORKFLOW_ACTION_IDS];

export type SystemWorkflowActionDefinition = {
  canonicalId: SystemWorkflowActionId;
  changeSummary?: string;
  description: string;
  label: string;
  schedule?: string;
  version?: number;
};

export const SYSTEM_WORKFLOW_ACTION_DEFINITIONS: readonly SystemWorkflowActionDefinition[] =
  [
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_META_DRAFT,
      description: 'Creates reviewed, paused-only Meta ad drafts.',
      label: 'Brand Remix Paused Meta Draft',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_PAUSED_X_ADS_DRAFT,
      description: 'Creates reviewed, paused-only X Ads drafts.',
      label: 'Brand Remix Paused X Ads Draft',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_REVIEW_HANDOFF,
      description: 'Creates canonical draft posts and routes them to Review.',
      label: 'Brand Remix Review Handoff',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
      description: 'Publishes due posts through the connected brand account.',
      label: 'Scheduled Post Publishing',
      schedule: '*/15 * * * *',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REPLY_DM_AUTOMATION,
      description: 'Generates and sends reply-bot replies and direct messages.',
      label: 'Reply and DM Automation',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.EVERGREEN_RELEASE_EXPANSION,
      description: 'Materializes the next bounded evergreen release.',
      label: 'Evergreen Release Expansion',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TWITTER_PUBLISH_ACTION,
      description: 'Publishes X originals, replies, quotes, and reposts.',
      label: 'X Publish Action',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_REPLY_AUTOMATION,
      description: 'Generates and posts outreach-campaign replies.',
      label: 'Campaign Reply Automation',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_DM_AUTOMATION,
      description: 'Generates and sends outreach-campaign direct messages.',
      label: 'Campaign DM Automation',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TIKTOK_STATUS_RECONCILIATION,
      description: 'Reconciles pending TikTok publication status.',
      label: 'TikTok Status Reconciliation',
      schedule: '*/5 * * * *',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_STATUS_RECONCILIATION,
      description: 'Reconciles YouTube video visibility.',
      label: 'YouTube Status Reconciliation',
      schedule: '0 1 * * *',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
      description: 'Processes daily streak reminders, freezes, and breaks.',
      label: 'Streak Maintenance',
      schedule: '30 0 * * *',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REVIEW_GATE_TIMEOUT,
      description: 'Resolves workflow review gates whose timeout elapsed.',
      label: 'Review Gate Timeout Resolution',
      schedule: '*/15 * * * *',
    },
    {
      canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SOCIAL_REPLY_CAMPAIGN,
      description: 'Dispatches one rate-limited inbox campaign message.',
      label: 'Inbox Reply Campaign Dispatch',
    },
  ];

const DEFINITIONS_BY_ID = new Map(
  SYSTEM_WORKFLOW_ACTION_DEFINITIONS.map((definition) => [
    definition.canonicalId,
    definition,
  ]),
);

const SWEEP_DRIVEN_SYSTEM_WORKFLOW_IDS = new Set<string>(
  Object.values(SYSTEM_WORKFLOW_ACTION_IDS),
);

export function isSweepDrivenSystemWorkflow(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return false;
  }
  const systemWorkflow = (metadata as Record<string, unknown>)[
    SYSTEM_WORKFLOW_METADATA_KEY
  ];
  if (
    !systemWorkflow ||
    typeof systemWorkflow !== 'object' ||
    Array.isArray(systemWorkflow)
  ) {
    return false;
  }
  return SWEEP_DRIVEN_SYSTEM_WORKFLOW_IDS.has(
    String((systemWorkflow as Record<string, unknown>).canonicalId ?? ''),
  );
}

export type SystemWorkflowProvenance = {
  executionId: string;
  workflowId: string;
  workflowLabel: string;
};

export type SystemWorkflowActionRequest = {
  context: ExecutionContext;
  input: Record<string, unknown>;
  provenance: SystemWorkflowProvenance;
};

export type SystemWorkflowActionExecutor = (
  request: SystemWorkflowActionRequest,
) => Promise<unknown>;

export type RunSystemWorkflowInput = {
  actionType: string;
  canonicalId: SystemWorkflowActionId;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: string;
  postIds?: string[];
  source: string;
  trigger?: WorkflowExecutionTrigger;
  userId?: string;
};

@Injectable()
export class SystemWorkflowRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  registerAction(
    actionId: SystemWorkflowActionId,
    executor: SystemWorkflowActionExecutor,
  ): void {
    this.getEngineAdapter().registerExecutor(
      actionId,
      async (node, _inputs, context) => {
        const input = this.readRecord(node.config.payload);
        return executor({
          context,
          input,
          provenance: {
            executionId: context.executionId ?? context.runId,
            workflowId: context.workflowId,
            workflowLabel: DEFINITIONS_BY_ID.get(actionId)?.label ?? actionId,
          },
        });
      },
    );
  }

  async runAction<T>(input: RunSystemWorkflowInput): Promise<{
    provenance: SystemWorkflowProvenance;
    result: T;
  }> {
    const definition = DEFINITIONS_BY_ID.get(input.canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow action: ${input.canonicalId}`);
    }

    const userId = await this.resolveUserId(input.organizationId, input.userId);
    const workflow = await this.ensureSystemWorkflow(
      definition,
      input.organizationId,
      userId,
    );
    const execution = await this.getWorkflowExecutor().executeManualWorkflow(
      workflow.id,
      userId,
      input.organizationId,
      { payload: input.inputValues ?? {} },
      {
        ...(input.metadata ?? {}),
        actionType: input.actionType,
        canonicalId: input.canonicalId,
        source: input.source,
      },
      input.trigger ?? WorkflowExecutionTrigger.API,
    );

    if (execution.status !== WorkflowExecutionStatus.COMPLETED) {
      throw new Error(
        execution.error ?? `System workflow ${input.canonicalId} failed`,
      );
    }

    const provenance = {
      executionId: execution.executionId,
      workflowId: workflow.id,
      workflowLabel: workflow.label ?? definition.label,
    };
    if (input.postIds?.length) {
      await this.linkPostsToExecution(
        input.postIds,
        provenance,
        input.organizationId,
      );
    }

    const actionResult = execution.nodeResults.find(
      (nodeResult) => nodeResult.nodeId === 'system-action',
    );
    return { provenance, result: actionResult?.output as T };
  }

  private async ensureSystemWorkflow(
    definition: SystemWorkflowActionDefinition,
    organizationId: string,
    userId: string,
  ): Promise<{ id: string; label: string | null }> {
    const where = scopedWhere(organizationId, {
      metadata: {
        equals: definition.canonicalId,
        path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
      },
    });
    const existing = await this.prisma.workflow.findFirst({
      select: { id: true, label: true },
      where,
    });
    if (existing) {
      return existing;
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const recheck = await transaction.workflow.findFirst({
          select: { id: true, label: true },
          where,
        });
        if (recheck) {
          return recheck;
        }

        return createVersionedWorkflow(
          transaction,
          {
            description: definition.description,
            executionCount: 0,
            isDeleted: false,
            isScheduleEnabled: false,
            label: definition.label,
            metadata: {
              sourceTemplateChangeSummary:
                definition.changeSummary ??
                SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
              sourceTemplateId: definition.canonicalId,
              sourceTemplateVersion:
                definition.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION,
              sourceType: 'hidden-system-workflow',
              [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
                canonicalId: definition.canonicalId,
                changeSummary: definition.changeSummary,
                version: definition.version,
              }),
            },
            organizationId,
            progress: 0,
            schedule: definition.schedule,
            status: WorkflowStatus.ACTIVE,
            timezone: 'UTC',
            userId,
          },
          {
            edges: [],
            inputVariables: [
              {
                key: 'payload',
                label: 'Action input',
                required: true,
                type: 'json',
              },
            ],
            nodes: [
              {
                data: {
                  config: {
                    actionId: definition.canonicalId,
                    parameters: {},
                  },
                  inputVariableKeys: ['payload'],
                  label: definition.label,
                },
                id: 'system-action',
                position: { x: 0, y: 120 },
                type: 'genfeedAction',
              },
            ],
          },
        );
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async linkPostsToExecution(
    postIds: string[],
    provenance: SystemWorkflowProvenance,
    organizationId: string,
  ): Promise<void> {
    await this.prisma.post.updateMany({
      data: {
        sourceWorkflowId: provenance.workflowId,
        sourceWorkflowName: provenance.workflowLabel,
        workflowExecutionId: provenance.executionId,
      },
      where: { id: { in: postIds }, organizationId },
    });
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private getEngineAdapter(): WorkflowEngineAdapterService {
    return this.moduleRef.get(WorkflowEngineAdapterService, { strict: false });
  }

  private getWorkflowExecutor(): WorkflowExecutorService {
    return this.moduleRef.get(WorkflowExecutorService, { strict: false });
  }

  private async resolveUserId(
    organizationId: string,
    userId?: string,
  ): Promise<string> {
    if (userId) {
      return userId;
    }
    const organization = await this.prisma.organization.findUnique({
      select: { userId: true },
      where: { id: organizationId },
    });
    if (!organization?.userId) {
      throw new Error(
        `Cannot resolve workflow owner for organization ${organizationId}`,
      );
    }
    return organization.userId;
  }
}
