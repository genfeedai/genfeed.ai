import {
  buildSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
} from '@api/collections/workflows/system-workflow.contract';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  WorkflowExecutionStatus as SharedWorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowStatus,
} from '@genfeedai/enums';
import { WorkflowExecutionStatus as PrismaWorkflowExecutionStatus } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const SYSTEM_WORKFLOW_ACTION_IDS = {
  CAMPAIGN_DM_AUTOMATION: 'campaign-dm-automation',
  CAMPAIGN_REPLY_AUTOMATION: 'campaign-reply-automation',
  REPLY_DM_AUTOMATION: 'reply-dm-automation',
  SCHEDULED_POST_PUBLISHING: 'scheduled-post-publishing',
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

export const SYSTEM_WORKFLOW_ACTION_DEFINITIONS = [
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
    changeSummary: 'Initial scheduled publish system workflow action wrapper.',
    description:
      'Publishes due scheduled posts through the connected brand credential.',
    label: 'Scheduled Post Publishing',
    schedule: '*/15 * * * *',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.REPLY_DM_AUTOMATION,
    changeSummary: 'Initial reply and DM system workflow action wrapper.',
    description:
      'Generates and sends reply bot replies and optional DMs through connected social credentials.',
    label: 'Reply and DM Automation',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TWITTER_PUBLISH_ACTION,
    changeSummary: 'Initial Twitter publish system workflow action wrapper.',
    description:
      'Publishes Twitter original, reply, and quote actions through connected brand credentials.',
    label: 'Twitter Publish Action',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_REPLY_AUTOMATION,
    changeSummary:
      'Initial outreach campaign reply system workflow action wrapper.',
    description:
      'Generates and posts outreach campaign replies through connected brand credentials.',
    label: 'Campaign Reply Automation',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_DM_AUTOMATION,
    changeSummary:
      'Initial outreach campaign DM system workflow action wrapper.',
    description:
      'Generates and sends outreach campaign DMs through connected brand credentials.',
    label: 'Campaign DM Automation',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.TIKTOK_STATUS_RECONCILIATION,
    changeSummary:
      'Initial TikTok publish-status reconciliation system workflow action wrapper.',
    description:
      'Verifies pending TikTok publications and reconciles post status once moderation completes.',
    label: 'TikTok Status Reconciliation',
    schedule: '*/5 * * * *',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_STATUS_RECONCILIATION,
    changeSummary:
      'Initial YouTube publish-status reconciliation system workflow action wrapper.',
    description:
      'Syncs recent YouTube video visibility with the actual status reported by YouTube.',
    label: 'YouTube Status Reconciliation',
    schedule: '0 1 * * *',
  },
  {
    canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.STREAK_MAINTENANCE,
    changeSummary: 'Initial streak maintenance system workflow action wrapper.',
    description:
      'Processes daily streak state: at-risk reminders, streak freezes, and broken streaks.',
    label: 'Streak Maintenance',
    schedule: '30 0 * * *',
  },
] satisfies SystemWorkflowActionDefinition[];

export type SystemWorkflowProvenance = {
  executionId: string;
  workflowId: string;
  workflowLabel: string;
};

type SystemWorkflowActionInput<T> = {
  actionType: string;
  canonicalId: SystemWorkflowActionId;
  changeSummary?: string;
  description: string;
  failureMessage?: (result: T) => string | undefined;
  inputValues?: Record<string, unknown>;
  label: string;
  metadata?: Record<string, unknown>;
  organizationId: string;
  postIds?: string[];
  schedule?: string;
  source: string;
  trigger?: WorkflowExecutionTrigger;
  userId?: string;
  version?: number;
};

type SystemWorkflowActionResult<T> = {
  provenance: SystemWorkflowProvenance;
  result: T;
};

type WorkflowRecord = {
  id: string;
  label: string | null;
};

@Injectable()
export class SystemWorkflowProvenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async runAction<T>(
    input: SystemWorkflowActionInput<T>,
    action: (provenance: SystemWorkflowProvenance) => Promise<T>,
  ): Promise<SystemWorkflowActionResult<T>> {
    const userId = await this.resolveUserId(input.organizationId, input.userId);
    const workflow = await this.ensureSystemWorkflow({
      canonicalId: input.canonicalId,
      changeSummary: input.changeSummary,
      description: input.description,
      label: input.label,
      organizationId: input.organizationId,
      schedule: input.schedule,
      userId,
      version: input.version,
    });

    const execution = await this.createExecution({
      ...input,
      userId,
      workflowId: workflow.id,
      workflowLabel: workflow.label ?? input.label,
    });

    const provenance = {
      executionId: execution.id,
      workflowId: workflow.id,
      workflowLabel: workflow.label ?? input.label,
    };

    if (input.postIds?.length) {
      await this.linkPostsToExecution(
        input.postIds,
        provenance,
        input.organizationId,
      );
    }

    try {
      const result = await action(provenance);
      const failureMessage = input.failureMessage?.(result);
      await this.completeExecution({
        error: failureMessage,
        executionId: execution.id,
        input,
        result,
        workflowId: workflow.id,
      });

      return { provenance, result };
    } catch (error: unknown) {
      await this.completeExecution({
        error: this.errorMessage(error),
        executionId: execution.id,
        input,
        result: null,
        workflowId: workflow.id,
      });
      throw error;
    }
  }

  private async ensureSystemWorkflow(input: {
    canonicalId: SystemWorkflowActionId;
    changeSummary?: string;
    description: string;
    label: string;
    organizationId: string;
    schedule?: string;
    userId: string;
    version?: number;
  }): Promise<WorkflowRecord> {
    const where = {
      isDeleted: false,
      metadata: {
        equals: input.canonicalId,
        path: [SYSTEM_WORKFLOW_METADATA_KEY, 'canonicalId'],
      },
      organizationId: input.organizationId,
    };

    const existing = await this.prisma.workflow.findFirst({
      select: { id: true, label: true },
      where,
    });
    if (existing) {
      return existing;
    }

    try {
      const created = await this.prisma.$transaction(
        async (tx) => {
          const recheck = await tx.workflow.findFirst({
            select: { id: true, label: true },
            where,
          });
          if (recheck) {
            return recheck;
          }

          return await tx.workflow.create({
            data: {
              description: input.description,
              edges: [],
              executionCount: 0,
              inputVariables: [],
              isDeleted: false,
              // Schedule is display metadata only: system actions fire from the
              // workers sweep scheduler, never from the user-workflow scheduler
              // (no engine executor exists for systemWorkflowAction nodes).
              isScheduleEnabled: false,
              label: input.label,
              metadata: {
                sourceIssue: 1011,
                sourceTemplateChangeSummary:
                  input.changeSummary ??
                  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
                sourceTemplateId: input.canonicalId,
                sourceTemplateVersion:
                  input.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION,
                sourceType: 'system-action-workflow',
                [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
                  canonicalId: input.canonicalId,
                  changeSummary: input.changeSummary,
                  sourceIssue: 1011,
                  version: input.version,
                }),
              },
              nodes: [
                {
                  data: {
                    config: { canonicalId: input.canonicalId },
                    label: input.label,
                  },
                  id: 'system-action',
                  position: { x: 0, y: 120 },
                  type: 'systemWorkflowAction',
                },
              ],
              organizationId: input.organizationId,
              progress: 0,
              schedule: input.schedule,
              status: WorkflowStatus.ACTIVE,
              steps: [],
              timezone: 'UTC',
              userId: input.userId,
            } as never,
            select: { id: true, label: true },
          });
        },
        { isolationLevel: 'Serializable' },
      );

      return created;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2034') {
        const concurrentlyCreated = await this.prisma.workflow.findFirst({
          select: { id: true, label: true },
          where,
        });
        if (concurrentlyCreated) {
          return concurrentlyCreated;
        }
      }

      throw error;
    }
  }

  private async createExecution(
    input: SystemWorkflowActionInput<unknown> & {
      userId: string;
      workflowId: string;
      workflowLabel: string;
    },
  ): Promise<{ id: string }> {
    const startedAt = new Date();
    return await this.prisma.workflowExecution.create({
      data: {
        organizationId: input.organizationId,
        result: {
          inputValues: this.toJsonRecord(input.inputValues ?? {}),
          metadata: {
            ...(input.metadata ?? {}),
            actionType: input.actionType,
            canonicalId: input.canonicalId,
            source: input.source,
            systemWorkflowAction: true,
            workflowLabel: input.workflowLabel,
          },
          nodeResults: [
            {
              input: this.toJsonRecord(input.inputValues ?? {}),
              nodeId: 'system-action',
              nodeType: input.canonicalId,
              startedAt: startedAt.toISOString(),
              status: SharedWorkflowExecutionStatus.RUNNING,
            },
          ],
          progress: 0,
          trigger: input.trigger ?? WorkflowExecutionTrigger.API,
        },
        startedAt,
        status: PrismaWorkflowExecutionStatus.RUNNING,
        trigger: input.trigger ?? WorkflowExecutionTrigger.API,
        userId: input.userId,
        workflowId: input.workflowId,
      } as never,
      select: { id: true },
    });
  }

  private async completeExecution(input: {
    error?: string;
    executionId: string;
    input: SystemWorkflowActionInput<unknown>;
    result: unknown;
    workflowId: string;
  }): Promise<void> {
    const completedAt = new Date();
    const didFail = Boolean(input.error);

    await this.prisma.workflowExecution.update({
      data: {
        completedAt,
        error: input.error,
        result: {
          inputValues: this.toJsonRecord(input.input.inputValues ?? {}),
          metadata: {
            ...(input.input.metadata ?? {}),
            actionType: input.input.actionType,
            canonicalId: input.input.canonicalId,
            failed: didFail,
            source: input.input.source,
            systemWorkflowAction: true,
          },
          nodeResults: [
            {
              completedAt: completedAt.toISOString(),
              error: input.error,
              input: this.toJsonRecord(input.input.inputValues ?? {}),
              nodeId: 'system-action',
              nodeType: input.input.canonicalId,
              output: this.toJsonRecord(input.result),
              status: didFail
                ? SharedWorkflowExecutionStatus.FAILED
                : SharedWorkflowExecutionStatus.COMPLETED,
            },
          ],
          progress: 100,
          trigger: input.input.trigger ?? WorkflowExecutionTrigger.API,
        },
        status: didFail
          ? PrismaWorkflowExecutionStatus.FAILED
          : PrismaWorkflowExecutionStatus.COMPLETED,
      } as never,
      where: { id: input.executionId },
    });

    await this.prisma.workflow.update({
      data: {
        executionCount: { increment: 1 },
        lastExecutedAt: completedAt,
      } as never,
      where: { id: input.workflowId },
    });
  }

  private async linkPostsToExecution(
    postIds: string[],
    provenance: SystemWorkflowProvenance,
    tenantOrganizationId: string,
  ): Promise<void> {
    await this.prisma.post.updateMany({
      data: {
        sourceWorkflowId: provenance.workflowId,
        sourceWorkflowName: provenance.workflowLabel,
        workflowExecutionId: provenance.executionId,
      },
      where: { id: { in: postIds }, organizationId: tenantOrganizationId },
    });
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

  private errorMessage(error: unknown): string {
    return (error as Error)?.message || 'Unknown system workflow action error';
  }

  private toJsonRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return { value };
    }

    try {
      return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    } catch (error: unknown) {
      this.logger.warn('Failed to serialize system workflow action payload', {
        error: this.errorMessage(error),
      });
      return { unserializable: true };
    }
  }
}
