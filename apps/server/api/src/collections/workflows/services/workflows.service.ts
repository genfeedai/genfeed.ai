import process from 'node:process';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { type WorkflowExecutionDocument } from '@api/collections/workflow-executions/schemas/workflow-execution.schema';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import {
  WorkflowEntity,
  WorkflowStepEntity,
} from '@api/collections/workflows/entities/workflow.entity';
import {
  type WorkflowDocument,
  type WorkflowStep,
  type WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { SYSTEM_WORKFLOW_ACTION_DEFINITIONS } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowEngineAdapterService } from '@api/collections/workflows/services/workflow-engine-adapter.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  buildSystemWorkflowDuplicateMetadata,
  buildSystemWorkflowMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import {
  CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
  CONTENT_SCHEDULE_WORKFLOW_TEMPLATE_ID,
} from '@api/collections/workflows/templates/content-production-workflows.template';
import { DAILY_TRENDS_DIGEST_TEMPLATE } from '@api/collections/workflows/templates/daily-trends-digest.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  type TaskJobRequest,
  TaskQueueClientService,
} from '@api/services/task-queue-client/task-queue-client.service';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  CredentialPlatform,
  PostStatus,
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
} from '@genfeedai/enums';
import type { CreditEstimate } from '@genfeedai/workflow-engine';
import {
  calculateCreditEstimate,
  DEFAULT_CREDIT_COSTS,
  type ExecutionRunResult,
  type NodeStatusChangeEvent,
} from '@genfeedai/workflow-engine';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';

/** Template id for the predetermined per-org Daily Trends Digest workflow. */
const DAILY_TRENDS_DIGEST_TEMPLATE_ID = 'daily-trends-digest';

@Injectable()
export class WorkflowsService extends BaseService<
  WorkflowDocument,
  CreateWorkflowDto,
  UpdateWorkflowDto
> {
  constructor(
    public readonly prisma: PrismaService,
    readonly logger: LoggerService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
    @Optional() private readonly postsService?: PostsService,
    @Optional() private readonly taskQueueClient?: TaskQueueClientService,
    @Optional()
    private readonly workflowEngineAdapter?: WorkflowEngineAdapterService,
    @Optional()
    private readonly workflowExecutionsService?: WorkflowExecutionsService,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
  ) {
    super(prisma, 'workflow', logger);
  }

  private buildSeededSystemWorkflowMetadata(input: {
    extra?: Record<string, unknown>;
    sourceIssue: number;
    sourceTemplateId: string;
    sourceType?: string;
  }): Record<string, unknown> {
    return {
      ...(input.extra ?? {}),
      sourceIssue: input.sourceIssue,
      sourceTemplateId: input.sourceTemplateId,
      sourceType: input.sourceType ?? 'seeded-template',
      [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
        canonicalId: input.sourceTemplateId,
        sourceIssue: input.sourceIssue,
      }),
    };
  }

  private assertWorkflowMutable(workflow: Pick<WorkflowDocument, 'metadata'>) {
    if (!isProtectedSystemWorkflowMetadata(workflow.metadata)) {
      return;
    }

    throw new ForbiddenException(
      'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
    );
  }

  @HandleErrors('create workflow', 'workflows')
  async createWorkflow(
    userId: string,
    organizationId: string,
    workflowData: CreateWorkflowDto,
  ): Promise<WorkflowEntity> {
    let steps = workflowData.steps || [];
    const templateMetadata = workflowData.templateId
      ? {
          sourceTemplateId: workflowData.templateId,
          sourceType: 'seeded-template',
        }
      : undefined;

    // If using a template, load predefined steps
    if (
      workflowData.templateId &&
      WORKFLOW_TEMPLATES[workflowData.templateId]
    ) {
      const template = WORKFLOW_TEMPLATES[workflowData.templateId];
      const routineMetadata = template.routine
        ? { productizedRoutine: template.routine }
        : {};
      const shouldUseTemplateEdges =
        !workflowData.edges || workflowData.edges.length === 0;
      const shouldUseTemplateInputVariables =
        !workflowData.inputVariables ||
        workflowData.inputVariables.length === 0;
      const shouldUseTemplateNodes =
        !workflowData.nodes || workflowData.nodes.length === 0;

      workflowData = {
        ...workflowData,
        edges: shouldUseTemplateEdges ? template.edges : workflowData.edges,
        inputVariables: shouldUseTemplateInputVariables
          ? template.inputVariables
          : workflowData.inputVariables,
        isScheduleEnabled:
          workflowData.isScheduleEnabled ?? template.isScheduleEnabled,
        metadata: {
          ...templateMetadata,
          ...routineMetadata,
          ...(workflowData.metadata ?? {}),
        },
        nodes: shouldUseTemplateNodes ? template.nodes : workflowData.nodes,
        schedule: workflowData.schedule ?? template.schedule,
        timezone: workflowData.timezone ?? template.timezone,
      };
      steps = template.steps.map((step) => ({
        ...step,
        label: step.name,
        status: WorkflowStepStatus.PENDING,
      }));
    }

    // Create the workflow
    const workflow = await this.create({
      ...workflowData,
      executionCount: 0,
      label:
        workflowData.label ||
        `Workflow: ${workflowData.templateId || 'Custom'}`,
      metadata:
        workflowData.metadata || templateMetadata
          ? {
              ...templateMetadata,
              ...(workflowData.metadata ?? {}),
            }
          : undefined,
      organization: organizationId,
      progress: 0,
      status: workflowData.status ?? WorkflowStatus.ACTIVE,
      steps,
      user: userId,
    });

    // If trigger is manual, start execution immediately
    if ((workflowData.trigger as string) === 'manual') {
      this.executeWorkflowCompat(
        workflow._id.toString(),
        userId,
        organizationId,
      ).catch((error) => {
        if (this.logger) {
          this.logger.error('Workflow execution failed', error);
        }
      });
    }

    return EntityFactory.fromDocument(WorkflowEntity, workflow);
  }

  /**
   * Idempotently seeds the predetermined "Daily Trends Digest" workflow for an
   * organization. Seeded ON (`isScheduleEnabled: true`) so the workflow is the
   * default recurring automation path for every organization.
   * Safe to call repeatedly (e.g. on every org bootstrap + a one-time backfill).
   *
   * Race protection: the check-and-insert runs inside a SERIALIZABLE transaction
   * using the same `tx` client for both the read and the write. Two concurrent
   * callers cannot both observe "not found" and both insert — Postgres guarantees
   * that at most one of the two transactions commits; the other receives a
   * serialization error and this method silently returns (no row was seeded twice).
   */
  async ensureDailyTrendsDigestWorkflow(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const where = {
      isDeleted: false,
      metadata: {
        equals: DAILY_TRENDS_DIGEST_TEMPLATE_ID,
        path: ['sourceTemplateId'],
      },
      organizationId,
    };

    // Fast path: most calls hit an already-seeded org.
    const preCheck = await this.prisma.workflow.findFirst({
      select: { id: true, isScheduleEnabled: true },
      where,
    });

    if (preCheck) {
      if (!preCheck.isScheduleEnabled) {
        await this.prisma.workflow.update({
          data: { isScheduleEnabled: true },
          where: { id: preCheck.id },
        });
      }
      return;
    }

    // Serializable transaction: both the re-check AND the insert use the same
    // `tx` client so Postgres can detect a concurrent conflicting write and
    // serialise the two callers correctly.
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.workflow.findFirst({
            select: { id: true, isScheduleEnabled: true },
            where,
          });

          if (existing) {
            if (!existing.isScheduleEnabled) {
              await tx.workflow.update({
                data: { isScheduleEnabled: true },
                where: { id: existing.id },
              });
            }
            return;
          }

          await tx.workflow.create({
            data: {
              edges: DAILY_TRENDS_DIGEST_TEMPLATE.edges as never,
              executionCount: 0,
              isDeleted: false,
              isScheduleEnabled: true,
              label: 'Daily Trends Digest',
              metadata: this.buildSeededSystemWorkflowMetadata({
                sourceIssue: 1011,
                sourceTemplateId: DAILY_TRENDS_DIGEST_TEMPLATE_ID,
              }),
              nodes: DAILY_TRENDS_DIGEST_TEMPLATE.nodes as never,
              organizationId,
              progress: 0,
              schedule: '0 7 * * *',
              status: WorkflowStatus.ACTIVE,
              steps: [],
              timezone: 'UTC',
              userId,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      // A serialization failure means a concurrent caller already seeded this
      // workflow — treat it as success.
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        this.logger?.debug(
          'ensureDailyTrendsDigestWorkflow: serialization conflict — workflow already seeded by concurrent request',
          { organizationId },
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Idempotently seeds the default-on ad automation workflow set for an
   * organization. Missing credentials/config are handled inside the action
   * nodes as per-org skips, so new organizations get the workflows immediately
   * and they begin doing real work once ad automation becomes eligible.
   */
  async ensureAdAutomationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of AD_AUTOMATION_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                lifecycle: WorkflowLifecycle.PUBLISHED,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 782,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureAdAutomationWorkflows: serialization conflict — workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds the default-on campaign orchestration workflow set for an
   * organization. The workflow actions preserve the previous cron scanner
   * behavior by filtering eligible campaigns inside the node execution.
   */
  async ensureCampaignOrchestrationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 783,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureCampaignOrchestrationWorkflows: serialization conflict — workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds the default-on recurring agent automation workflow set
   * for an organization. The workflow nodes preserve the previous cron scanner
   * behavior by filtering active strategies/personas inside execution.
   */
  async ensureAgentAutopilotWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of AGENT_AUTOPILOT_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 784,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureAgentAutopilotWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds the default-on analytics sync workflow set for an
   * organization. Nodes preserve previous cron behavior by dispatching existing
   * provider queue jobs scoped to the workflow organization.
   */
  async ensureAnalyticsSyncWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of ANALYTICS_SYNC_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 785,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureAnalyticsSyncWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds the default-on content production workflow set for an
   * organization. Existing content schedules are mirrored into workflow rows
   * with their own cron expression/timezone and enabled state.
   */
  async ensureContentProductionWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of CONTENT_PRODUCTION_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 786,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureContentProductionWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }

    const schedules = await this.prisma.contentSchedule.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      where: { isDeleted: false, organizationId },
    });

    for (const schedule of schedules) {
      await this.ensureContentScheduleWorkflow(
        userId,
        organizationId,
        schedule.id,
      );
    }
  }

  async ensureContentScheduleWorkflow(
    userId: string,
    organizationId: string,
    contentScheduleId: string,
  ): Promise<void> {
    const schedule = await this.prisma.contentSchedule.findFirst({
      select: {
        brandId: true,
        cronExpression: true,
        id: true,
        isEnabled: true,
        name: true,
        timezone: true,
      },
      where: {
        id: contentScheduleId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!schedule) {
      await this.disableContentScheduleWorkflow(
        organizationId,
        contentScheduleId,
      );
      return;
    }

    const where = {
      isDeleted: false,
      metadata: {
        equals: contentScheduleId,
        path: ['contentScheduleId'],
      },
      organizationId,
    };

    const existing = await this.prisma.workflow.findFirst({
      select: { id: true },
      where,
    });
    const data = this.buildContentScheduleWorkflowData(schedule);

    if (existing) {
      await this.prisma.workflow.update({
        data,
        where: { id: existing.id },
      });
      return;
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const concurrent = await tx.workflow.findFirst({
            select: { id: true },
            where,
          });

          if (concurrent) {
            await tx.workflow.update({
              data,
              where: { id: concurrent.id },
            });
            return;
          }

          await tx.workflow.create({
            data: {
              ...data,
              executionCount: 0,
              inputVariables: [] as never,
              isDeleted: false,
              organizationId,
              progress: 0,
              steps: [] as never,
              userId,
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        this.logger?.debug(
          'ensureContentScheduleWorkflow: serialization conflict - workflow already synced by concurrent request',
          { contentScheduleId, organizationId },
        );
        return;
      }
      throw error;
    }
  }

  async disableContentScheduleWorkflow(
    organizationId: string,
    contentScheduleId: string,
  ): Promise<void> {
    await this.prisma.workflow.updateMany({
      data: {
        isDeleted: true,
        isScheduleEnabled: false,
        status: WorkflowStatus.PAUSED,
      },
      where: {
        isDeleted: false,
        metadata: {
          equals: contentScheduleId,
          path: ['contentScheduleId'],
        },
        organizationId,
      },
    });
  }

  private buildContentScheduleWorkflowData(schedule: {
    brandId: string | null;
    cronExpression: string | null;
    id: string;
    isEnabled: boolean;
    name: string | null;
    timezone: string | null;
  }): Record<string, unknown> {
    return {
      description: `Workflow-backed content schedule ${schedule.id}`,
      edges: [] as never,
      isScheduleEnabled: schedule.isEnabled === true,
      label: `Content Schedule: ${schedule.name || schedule.id}`,
      metadata: {
        brandId: schedule.brandId,
        contentScheduleId: schedule.id,
        sourceIssue: 786,
        sourceTemplateId: CONTENT_SCHEDULE_WORKFLOW_TEMPLATE_ID,
        sourceType: 'content-schedule',
      },
      nodes: this.buildContentScheduleNodes(schedule) as never,
      schedule: schedule.cronExpression ?? '* * * * *',
      status: WorkflowStatus.ACTIVE,
      timezone: schedule.timezone ?? 'UTC',
    };
  }

  private buildContentScheduleNodes(schedule: {
    brandId: string | null;
    id: string;
  }): WorkflowVisualNode[] {
    const config: Record<string, unknown> = {
      contentScheduleId: schedule.id,
    };

    if (schedule.brandId) {
      config.brandId = schedule.brandId;
    }

    return [
      {
        data: {
          config,
          label: 'Run Content Schedule',
        },
        id: 'contentScheduleRun',
        position: { x: 0, y: 120 },
        type: 'contentScheduleRun',
      },
    ];
  }

  /**
   * Idempotently seeds default-on reply/social polling workflow schedules for
   * an organization. Nodes preserve the previous cron scanner behavior by
   * discovering active reply configs and workflow social trigger nodes during
   * execution, scoped to the workflow organization.
   */
  async ensureReplyPollingWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of REPLY_POLLING_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 787,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureReplyPollingWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds default-on trend notification workflow schedules for an
   * organization. Each cadence executor checks the org owner's current settings
   * at run time, preserving legacy frequency/recipient semantics while letting
   * workflow schedule toggles pause the tenant-facing notification path.
   */
  async ensureTrendNotificationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of TREND_NOTIFICATION_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  extra: { cadence: template.cadence },
                  sourceIssue: 788,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureTrendNotificationWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds default-on livestream bot active-session processing for
   * an organization. The executor preserves the previous per-minute cron scan
   * while keeping execution scoped to the workflow organization.
   */
  async ensureLivestreamBotWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const template of LIVESTREAM_BOT_WORKFLOW_TEMPLATES) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: template.id,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: template.description,
                edges: (template.edges ?? []) as never,
                executionCount: 0,
                inputVariables: (template.inputVariables ?? []) as never,
                isDeleted: false,
                isScheduleEnabled: true,
                label: template.name,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 793,
                  sourceTemplateId: template.id,
                }),
                nodes: (template.nodes ?? []) as never,
                organizationId,
                progress: 0,
                schedule: template.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: template.steps as never,
                timezone: 'UTC',
                userId,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureLivestreamBotWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { organizationId, templateId: template.id },
          );
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Idempotently seeds action-level system workflows that wrap historical
   * hardcoded product actions. Runtime callers still create-on-demand as a
   * fail-closed backstop, but seeded orgs can inspect/duplicate these workflows
   * before the first action execution.
   */
  async ensureSystemActionWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    for (const definition of SYSTEM_WORKFLOW_ACTION_DEFINITIONS) {
      const where = {
        isDeleted: false,
        metadata: {
          equals: definition.canonicalId,
          path: ['sourceTemplateId'],
        },
        organizationId,
      };

      const preCheck = await this.prisma.workflow.findFirst({
        select: { id: true },
        where,
      });

      if (preCheck) {
        continue;
      }

      try {
        await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.workflow.findFirst({
              select: { id: true },
              where,
            });

            if (existing) {
              return;
            }

            await tx.workflow.create({
              data: {
                description: definition.description,
                edges: [],
                executionCount: 0,
                inputVariables: [],
                isDeleted: false,
                isScheduleEnabled: Boolean(definition.schedule),
                label: definition.label,
                metadata: this.buildSeededSystemWorkflowMetadata({
                  sourceIssue: 1011,
                  sourceTemplateId: definition.canonicalId,
                  sourceType: 'system-action-workflow',
                }),
                nodes: [
                  {
                    data: {
                      config: { canonicalId: definition.canonicalId },
                      label: definition.label,
                    },
                    id: 'system-action',
                    position: { x: 0, y: 120 },
                    type: 'systemWorkflowAction',
                  },
                ],
                organizationId,
                progress: 0,
                schedule: definition.schedule,
                status: WorkflowStatus.ACTIVE,
                steps: [],
                timezone: 'UTC',
                userId,
              } as never,
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode === 'P2034') {
          this.logger?.debug(
            'ensureSystemActionWorkflows: serialization conflict - workflow already seeded by concurrent request',
            { definitionId: definition.canonicalId, organizationId },
          );
          continue;
        }
        throw error;
      }
    }
  }

  async executeWorkflow(workflowId: string): Promise<void> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
    });
    if (!workflowDoc) {
      throw new NotFoundException('Workflow');
    }
    const workflow = EntityFactory.fromDocument(WorkflowEntity, workflowDoc);
    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    if (!workflow.user || !workflow.organization) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    try {
      await this.patch(workflowId, {
        progress: 0,
        startedAt: new Date(),
        status: WorkflowStatus.RUNNING,
      });

      await this.emitWorkflowEvent(workflow, 'started', {
        progress: 0,
        status: 'started',
      });

      const { steps } = workflow;
      const completed = new Set<string>();
      const failed = new Set<string>();

      // Execute steps in dependency order
      while (completed.size + failed.size < steps.length) {
        const readySteps = steps.filter((step: WorkflowStep) => {
          if (completed.has(step.id) || failed.has(step.id)) {
            return false;
          }
          if (!step.dependsOn || step.dependsOn.length === 0) {
            return true;
          }
          return step.dependsOn.every((depId: string) => completed.has(depId));
        });

        if (readySteps.length === 0) {
          const hasBlockedByFailure = steps.some(
            (step: WorkflowStep) =>
              !completed.has(step.id) &&
              !failed.has(step.id) &&
              step.dependsOn?.some((depId: string) => failed.has(depId)),
          );

          if (hasBlockedByFailure || failed.size > 0) {
            // Mark remaining steps blocked by failures as failed
            for (const step of steps) {
              if (!completed.has(step.id) && !failed.has(step.id)) {
                failed.add(step.id);
                await this.updateWorkflowStep(workflowId, step.id, {
                  completedAt: new Date(),
                  error: 'Blocked by failed dependency',
                  status: WorkflowStepStatus.FAILED,
                });
              }
            }
            break;
          }
          throw new BadRequestException(
            'Circular dependency or missing step detected',
          );
        }

        await Promise.all(
          readySteps.map(async (step: WorkflowStep) => {
            try {
              await this.updateWorkflowStep(workflowId, step.id, {
                startedAt: new Date(),
                status: WorkflowStepStatus.PROCESSING,
              });

              const output = await this.executeWorkflowStep(workflow, step);

              await this.updateWorkflowStep(workflowId, step.id, {
                completedAt: new Date(),
                output: output?._id as string | undefined,
                progress: 100,
                status: WorkflowStepStatus.COMPLETED,
              });

              completed.add(step.id);

              // Progress counts both completed and failed (fix: was only counting completed)
              const progress = Math.round(
                ((completed.size + failed.size) / steps.length) * 100,
              );
              await this.patch(workflowId, { progress });

              await this.emitWorkflowEvent(workflow, 'progress', {
                progress,
                status: 'completed',
                stepId: step.id,
                stepName: step.label,
              });
            } catch (error: unknown) {
              failed.add(step.id);

              await this.updateWorkflowStep(workflowId, step.id, {
                completedAt: new Date(),
                error: (error as Error)?.message ?? 'Unknown error',
                status: WorkflowStepStatus.FAILED,
              });

              await this.emitWorkflowEvent(workflow, 'step-error', {
                error: (error as Error)?.message ?? 'Unknown error',
                stepId: step.id,
                stepName: step.label,
              });
            }
          }),
        );
      }

      const finalStatus =
        failed.size === 0 ? WorkflowStatus.COMPLETED : WorkflowStatus.FAILED;

      await this.patch(workflowId, {
        completedAt: new Date(),
        executionCount: (workflow.executionCount ?? 0) + 1,
        lastExecutedAt: new Date(),
        progress: 100,
        status: finalStatus,
      });

      await this.websocketService?.publishWorkflowStatus(
        workflowId,
        finalStatus === WorkflowStatus.COMPLETED ? 'completed' : 'failed',
        workflow.user.toString(),
        {
          failedSteps: failed.size,
          workflowLabel: workflow.label,
        },
      );

      await this.emitWorkflowEvent(
        workflow,
        finalStatus === WorkflowStatus.COMPLETED ? 'completed' : 'failed',
        {
          completedSteps: completed.size,
          failedSteps: failed.size,
          status: finalStatus,
          totalSteps: steps.length,
        },
      );
    } catch (error: unknown) {
      await this.patch(workflowId, {
        completedAt: new Date(),
        status: WorkflowStatus.FAILED,
      });

      await this.websocketService?.publishWorkflowStatus(
        workflowId,
        'failed',
        workflow.user.toString(),
        {
          error: (error as Error)?.message ?? 'Unknown error',
          workflowLabel: workflow.label,
        },
      );

      await this.emitWorkflowEvent(workflow, 'error', {
        error: (error as Error)?.message ?? 'Unknown error',
        status: 'failed',
      });

      throw error;
    }
  }

  @HandleErrors('execute workflow compat', 'workflows')
  async executeWorkflowCompat(
    workflowId: string,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
  ): Promise<{ executionId?: string; mode: 'legacy' | 'node' }> {
    const workflowDoc = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
      user: userId,
    });

    if (!workflowDoc) {
      throw new NotFoundException('Workflow');
    }

    if (!this.shouldUseNodeExecutor(workflowDoc)) {
      await this.executeWorkflow(workflowId);
      return { mode: 'legacy' };
    }

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot execute node workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      workflowId,
      userId,
      organizationId,
      inputValues,
      metadata,
      trigger,
    );

    return {
      executionId: result.executionId,
      mode: 'node',
    };
  }

  private async executeWorkflowStep(
    workflow: WorkflowEntity,
    step: WorkflowStepEntity,
  ): Promise<Record<string, unknown>> {
    const { category, config } = step;
    const sourceAsset = workflow.sourceAsset;

    // Emit step start event
    await this.emitWorkflowEvent(workflow, 'step-started', {
      category,
      stepId: step.id,
      stepName: step.label,
    });

    switch (category) {
      case WorkflowStepCategory.TRANSFORM:
        return this.executeTransform(sourceAsset, config);

      case WorkflowStepCategory.UPSCALE:
        return this.executeUpscale(sourceAsset, config);

      case WorkflowStepCategory.CAPTION:
        return this.executeCaptioning(sourceAsset, config);

      case WorkflowStepCategory.PUBLISH:
        return this.executePublish(sourceAsset, config, workflow);

      case WorkflowStepCategory.RESIZE:
        return this.executeResize(sourceAsset, config);

      case WorkflowStepCategory.CLIP:
        return this.executeClip(sourceAsset, config);

      case WorkflowStepCategory.WEBHOOK:
        return this.executeWebhook(sourceAsset, config, workflow);

      case WorkflowStepCategory.DELAY:
        return this.executeDelay(config);

      default:
        throw new BadRequestException(
          `Unknown workflow step type: ${category}`,
        );
    }
  }

  // Generic queue job executor for workflow steps
  private async executeQueuedJob(
    stepType: string,
    assetId: string | undefined,
    config: Record<string, unknown>,
    queueMethod: keyof TaskQueueClientService,
    resultKey: string,
  ): Promise<Record<string, unknown>> {
    if (!this.taskQueueClient) {
      throw new Error(
        `Cannot execute ${stepType} step: task queue client is not available`,
      );
    }

    if (!assetId) {
      throw new BadRequestException(
        `Cannot execute ${stepType} step without a source asset`,
      );
    }

    const queueFn = this.taskQueueClient[queueMethod] as (
      data: TaskJobRequest,
    ) => Promise<Record<string, unknown>>;

    const job = await queueFn({
      assetId: assetId.toString(),
      config: config as Record<string, never>,
      organizationId: (config.organizationId as string) || '',
      taskId: assetId.toString(),
      userId: (config.userId as string) || '',
    });

    return {
      _id: assetId,
      config,
      jobId: (job as Record<string, unknown>).id,
      [resultKey]: true,
    };
  }

  // Step execution methods (consolidated)
  private executeTransform(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'transform',
      assetId,
      config,
      'queueTransformJob',
      'transformed',
    );
  }

  private executeUpscale(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'upscale',
      assetId,
      config,
      'queueUpscaleJob',
      'upscaled',
    );
  }

  private executeCaptioning(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'captioning',
      assetId,
      config,
      'queueCaptionJob',
      'captioned',
    );
  }

  private async executePublish(
    assetId: string | undefined,
    config: Record<string, unknown>,
    workflow: WorkflowEntity,
  ): Promise<Record<string, unknown>> {
    const { platforms, schedule, visibility } = config as Record<
      string,
      unknown
    >;

    if (this.postsService) {
      const postsService = this.postsService;
      const posts = await Promise.all(
        (platforms as string[]).map((platform: string) =>
          postsService.create({
            brand: workflow.brands?.[0],
            credential: config.credential,
            description: config.description as string,
            ingredients: assetId ? [assetId] : [],
            label: config.label as string,
            organization: workflow.organization,
            platform: platform as CredentialPlatform,
            scheduledDate:
              schedule === 'immediate'
                ? new Date()
                : (config.scheduledAt as Date),
            status: (visibility as PostStatus) || PostStatus.SCHEDULED,
            user: workflow.user,
          } as never),
        ),
      );
      return { posts } as Record<string, unknown>;
    }

    return { _id: assetId, config, published: true };
  }

  private executeResize(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'resize',
      assetId,
      config,
      'queueResizeJob',
      'resized',
    );
  }

  private executeClip(
    assetId: string | undefined,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.executeQueuedJob(
      'clip',
      assetId,
      config,
      'queueClipJob',
      'clipped',
    );
  }

  private async executeWebhook(
    assetId: string | undefined,
    config: Record<string, unknown>,
    _workflow: WorkflowEntity,
  ): Promise<Record<string, unknown>> {
    const webhookUrl = config.url as string | undefined;
    if (!webhookUrl) {
      throw new Error(
        'Webhook execution failed: no webhook URL configured in step config.',
      );
    }

    if (this.logger) {
      this.logger.debug('Executing webhook step', {
        assetId,
        config,
        webhookUrl,
      });
    }

    const payload = {
      assetId: assetId?.toString(),
      config,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `Webhook dispatch failed: ${response.status} ${response.statusText} from ${webhookUrl}`,
      );
    }

    return {
      _id: assetId,
      config,
      webhookSent: true,
      webhookStatus: response.status,
    };
  }

  private async executeDelay(
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const delay = (config.duration as number) || 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return { delayed: true, duration: delay };
  }

  private async updateWorkflowStep(
    workflowId: string,
    stepId: string,
    updates: Partial<WorkflowStep>,
  ): Promise<void> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
    });
    if (!workflow) {
      return;
    }

    const stepIndex = workflow.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) {
      return;
    }

    const updatedSteps = [...workflow.steps];
    updatedSteps[stepIndex] = { ...updatedSteps[stepIndex], ...updates };

    await this.patch(workflowId, {
      steps: updatedSteps,
    });
  }

  private async emitWorkflowEvent(
    workflow: WorkflowEntity | string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.websocketService) {
      return;
    }

    const workflowId =
      typeof workflow === 'string'
        ? workflow
        : workflow?._id
          ? String(workflow._id)
          : undefined;

    if (!workflowId) {
      return;
    }

    await this.websocketService.emit(`workflow:${workflowId}:${event}`, {
      workflowId,
      ...data,
    });
  }

  async getWorkflowTemplates() {
    return await Promise.resolve(Object.values(WORKFLOW_TEMPLATES));
  }

  async cloneWorkflow(
    workflowId: string,
    userId: string,
    organizationId: string,
    targetBrandId?: string,
  ): Promise<WorkflowEntity> {
    const workflowDoc = await this.findVisibleOrThrow(workflowId, {
      organization: organizationId,
      user: userId,
    });
    const isProtectedSystemWorkflow = isProtectedSystemWorkflowMetadata(
      workflowDoc.metadata,
    );
    const sourceWorkflowId = String(workflowDoc._id ?? workflowDoc.id);
    const sourceLabel = workflowDoc.label ?? workflowDoc.name ?? 'Workflow';

    const clonedWorkflow = await this.create({
      ...workflowDoc,
      brands: isProtectedSystemWorkflow
        ? workflowDoc.brands
        : targetBrandId
          ? [targetBrandId]
          : workflowDoc.brands,
      completedAt: undefined,
      defaultRecurringBrandId: isProtectedSystemWorkflow
        ? undefined
        : targetBrandId || workflowDoc.defaultRecurringBrandId,
      executionCount: 0,
      isScheduleEnabled: isProtectedSystemWorkflow
        ? false
        : workflowDoc.isScheduleEnabled,
      label: `${sourceLabel} (Copy)`,
      lastExecutedAt: undefined,
      lockedNodeIds: isProtectedSystemWorkflow
        ? []
        : (workflowDoc.lockedNodeIds ?? []),
      metadata: buildSystemWorkflowDuplicateMetadata(
        workflowDoc.metadata,
        sourceWorkflowId,
      ),
      organization: organizationId,
      progress: 0,
      recurrence: undefined,
      schedule: isProtectedSystemWorkflow ? undefined : workflowDoc.schedule,
      startedAt: undefined,
      status: WorkflowStatus.DRAFT,
      user: userId,
    } as unknown as CreateWorkflowDto);

    return EntityFactory.fromDocument(WorkflowEntity, clonedWorkflow);
  }

  @HandleErrors('set workflow thumbnail', 'workflows')
  async setThumbnail(
    workflowId: string,
    thumbnailUrl: string,
    nodeId: string,
    userId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
      user: userId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }
    this.assertWorkflowMutable(workflow);

    const updated = await this.patch(workflowId, {
      thumbnail: thumbnailUrl,
      thumbnailNodeId: nodeId,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  async getWorkflowStatistics(
    userId: string,
    organizationId: string,
  ): Promise<Array<{ _id: string; count: number }>> {
    const workflows = await this.prisma.workflow.findMany({
      select: { status: true },
      where: {
        isDeleted: false,
        organizationId,
        userId,
      },
    });

    const counts = workflows.reduce<Map<string, number>>((acc, workflow) => {
      const status = String(workflow.status);
      acc.set(status, (acc.get(status) ?? 0) + 1);
      return acc;
    }, new Map());

    return Array.from(counts.entries()).map(([_id, count]) => ({
      _id,
      count,
    }));
  }

  // =============================================================================
  // NEW WORKFLOW ENGINE METHODS
  // =============================================================================

  /**
   * Execute a partial workflow (subset of nodes)
   */
  @HandleErrors('execute partial workflow', 'workflows')
  async executePartial(
    workflowId: string,
    nodeIds: string[],
    userId: string,
    organizationId: string,
    options: { respectLocks?: boolean; dryRun?: boolean } = {},
  ): Promise<
    | WorkflowExecutionDocument
    | { runId: string; status: string; message: string }
  > {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Validate nodes exist
    const workflowNodeIds = workflow.nodes.map((n) => n.id);
    const invalidNodes = nodeIds.filter((id) => !workflowNodeIds.includes(id));
    if (invalidNodes.length > 0) {
      throw new BadRequestException(
        `Invalid node IDs: ${invalidNodes.join(', ')}`,
      );
    }

    if (options.dryRun) {
      return {
        message: 'Dry run complete - validation passed',
        runId: 'dry-run',
        status: 'validated',
      };
    }

    if (!this.workflowExecutionsService) {
      throw new Error(
        'Workflow executions service is not available - cannot track partial workflow execution',
      );
    }

    const execution = await this.workflowExecutionsService.createExecution(
      userId,
      organizationId,
      {
        inputValues: {},
        metadata: {
          executionMode: 'partial',
          selectedNodeIds: nodeIds,
        },
        trigger: WorkflowExecutionTrigger.MANUAL,
        workflow: workflowId,
      },
    );
    const startedExecution =
      await this.workflowExecutionsService.startExecution(
        execution._id.toString(),
      );
    const runId = execution._id.toString();

    await this.patch(workflowId, {
      status: WorkflowStatus.RUNNING,
    });

    // Start async execution
    this.executePartialAsync(workflowId, runId, nodeIds, options).catch(
      (error) => {
        if (this.logger) {
          this.logger.error('Partial workflow execution failed', error);
        }
      },
    );

    return startedExecution ?? execution;
  }

  /**
   * Internal async execution for partial workflow.
   * Uses WorkflowEngineAdapterService when available, falls back to sequential execution.
   */
  private async executePartialAsync(
    workflowId: string,
    runId: string,
    nodeIds: string[],
    options: { respectLocks?: boolean } = {},
  ): Promise<void> {
    try {
      const workflow = await this.findOne({
        _id: workflowId,
        isDeleted: false,
      });
      if (!workflow) {
        return;
      }

      if (this.workflowEngineAdapter && this.workflowExecutionsService) {
        // Use workflow engine for proper topological execution
        const executableWorkflow =
          this.workflowEngineAdapter.convertToExecutableWorkflow(workflow);
        const totalNodes = nodeIds.length;

        const result = await this.workflowEngineAdapter.executeWorkflow(
          executableWorkflow,
          {
            nodeIds,
            onNodeStatusChange: async (event: NodeStatusChangeEvent) => {
              const node = executableWorkflow.nodes.find(
                (candidate) => candidate.id === event.nodeId,
              );

              await this.workflowExecutionsService?.updateNodeResult(
                runId,
                {
                  completedAt:
                    event.newStatus === 'completed' ||
                    event.newStatus === 'failed' ||
                    event.newStatus === 'skipped'
                      ? new Date()
                      : undefined,
                  error: event.error,
                  nodeId: event.nodeId,
                  nodeType: node?.type ?? 'unknown',
                  output:
                    event.output && typeof event.output === 'object'
                      ? (event.output as Record<string, unknown>)
                      : undefined,
                  progress:
                    event.newStatus === 'completed' ||
                    event.newStatus === 'skipped'
                      ? 100
                      : event.newStatus === 'running'
                        ? 0
                        : undefined,
                  startedAt:
                    event.newStatus === 'running' ? new Date() : undefined,
                  status: this.mapExecutionNodeStatus(event.newStatus),
                },
                totalNodes,
              );

              await this.emitWorkflowEvent(
                workflowId,
                `node-${event.newStatus}`,
                {
                  nodeId: event.nodeId,
                  runId,
                },
              );
            },
            onProgress: async (event: { progress: number }) => {
              await this.patch(workflowId, {
                progress: event.progress,
              });
            },
            respectLocks: options.respectLocks,
          },
        );

        await this.workflowExecutionsService.completeExecution(
          runId,
          result.status === 'failed' ? result.error : undefined,
        );

        if (result.totalCreditsUsed > 0) {
          await this.workflowExecutionsService.setCreditsUsed(
            runId,
            result.totalCreditsUsed,
          );
        }

        const failedNodeId = this.findFirstFailedNodeId(result);
        if (failedNodeId) {
          await this.workflowExecutionsService.setFailedNodeId(
            runId,
            failedNodeId,
          );
        }
      } else {
        // Fallback: no workflow engine available - cannot execute
        throw new Error(
          'Workflow engine adapter is not available - cannot execute workflow nodes',
        );
      }

      await this.patch(workflowId, {
        completedAt: new Date(),
        progress: 100,
        status: WorkflowStatus.COMPLETED,
      });
    } catch (error) {
      if (this.workflowExecutionsService) {
        await this.workflowExecutionsService.completeExecution(
          runId,
          (error as Error)?.message ?? 'Unknown error',
        );
      }

      await this.patch(workflowId, {
        completedAt: new Date(),
        status: WorkflowStatus.FAILED,
      });
    }
  }

  /**
   * Resume execution from a failed run
   */
  @HandleErrors('resume workflow execution', 'workflows')
  async resumeFromFailed(
    workflowId: string,
    runId: string,
    userId: string,
    organizationId: string,
  ): Promise<{ runId: string; status: string; message: string }> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Find the failed execution from the workflow-executions collection
    const failedRun = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: organizationId,
      workflow: workflowId,
    });

    if (!failedRun) {
      throw new NotFoundException(`Execution run ${runId} not found`);
    }

    if (String(failedRun.status) !== WorkflowExecutionStatus.FAILED) {
      throw new BadRequestException(`Run ${runId} is not in failed state`);
    }

    if (!failedRun.failedNodeId) {
      throw new BadRequestException('No failed node ID recorded');
    }

    const resumedExecution = await this.executePartial(
      workflowId,
      [failedRun.failedNodeId],
      userId,
      organizationId,
    );

    if ('runId' in resumedExecution) {
      return {
        message: String(resumedExecution.message),
        runId: String(resumedExecution.runId),
        status: String(resumedExecution.status),
      };
    }

    return {
      message: 'Partial execution started',
      runId: resumedExecution._id.toString(),
      status: resumedExecution.status,
    };
  }

  /**
   * Validate credits for workflow execution
   */
  @HandleErrors('validate credits', 'workflows')
  async validateCredits(
    workflowId: string,
    organizationId: string,
    nodeIds?: string[],
  ): Promise<CreditEstimate> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    // Get real organization credit balance
    const availableCredits = this.creditsUtilsService
      ? await this.creditsUtilsService.getOrganizationCreditsBalance(
          organizationId,
        )
      : 0;

    // Filter nodes if specific IDs provided
    let nodes: WorkflowVisualNode[] = workflow.nodes || [];
    if (nodeIds && nodeIds.length > 0) {
      nodes = nodes.filter((n) => nodeIds.includes(n.id));
    }

    // Convert to executable nodes format
    const executableNodes = nodes.map((n) => ({
      config: n.data?.config || {},
      id: n.id,
      inputs: [] as string[],
      label: n.data?.label || n.type,
      type: n.type,
    }));

    return calculateCreditEstimate(
      executableNodes,
      availableCredits,
      DEFAULT_CREDIT_COSTS,
    );
  }

  /**
   * Publish a workflow (change lifecycle to published)
   */
  @HandleErrors('publish workflow', 'workflows')
  async publishWorkflowLifecycle(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }
    this.assertWorkflowMutable(workflow);

    const updated = await this.patch(workflowId, {
      lifecycle: WorkflowLifecycle.PUBLISHED,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Archive a workflow (change lifecycle to archived)
   */
  @HandleErrors('archive workflow', 'workflows')
  async archiveWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }
    this.assertWorkflowMutable(workflow);

    const updated = await this.patch(workflowId, {
      lifecycle: WorkflowLifecycle.ARCHIVED,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Get execution logs for a specific run
   */
  @HandleErrors('get execution logs', 'workflows')
  async getExecutionLogs(
    workflowId: string,
    runId: string,
    organizationId: string,
  ): Promise<Record<string, unknown>> {
    const execution = await this.workflowExecutionsService?.findOne({
      _id: runId,
      isDeleted: false,
      organization: organizationId,
      workflow: workflowId,
    });

    if (!execution) {
      throw new NotFoundException(`Execution run ${runId} not found`);
    }

    return {
      completedAt: execution.completedAt,
      error: execution.error,
      nodeResults: execution.nodeResults || [],
      runId: execution._id.toString(),
      startedAt: execution.startedAt,
      status: execution.status,
      totalCreditsUsed: execution.creditsUsed,
      workflowId,
    };
  }

  /**
   * Lock nodes (skip execution, use cached output)
   */
  @HandleErrors('lock nodes', 'workflows')
  async lockNodes(
    workflowId: string,
    nodeIds: string[],
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }
    this.assertWorkflowMutable(workflow);

    const currentLocked = workflow.lockedNodeIds || [];
    const newLocked = [...new Set([...currentLocked, ...nodeIds])];

    const updated = await this.patch(workflowId, {
      lockedNodeIds: newLocked,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  /**
   * Unlock nodes
   */
  @HandleErrors('unlock nodes', 'workflows')
  async unlockNodes(
    workflowId: string,
    nodeIds: string[],
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }
    this.assertWorkflowMutable(workflow);

    const currentLocked = workflow.lockedNodeIds || [];
    const newLocked = currentLocked.filter((id) => !nodeIds.includes(id));

    const updated = await this.patch(workflowId, {
      lockedNodeIds: newLocked,
    });

    return EntityFactory.fromDocument(WorkflowEntity, updated);
  }

  // ===========================================================================
  // WEBHOOK TRIGGER METHODS
  // ===========================================================================

  /**
   * Fetch a workflow the caller owns (org-scoped, optionally user-scoped) or
   * throw the canonical {@link NotFoundException}. Single source of truth for
   * the ownership-guard preamble that used to be duplicated across the
   * workflows controllers with three divergent 404 shapes.
   */
  async findOwnedOrThrow(
    workflowId: string,
    scope: { organization: string; user?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: scope.organization,
      ...(scope.user ? { user: scope.user } : {}),
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    return workflow;
  }

  /**
   * Fetch a workflow the caller may inspect. Protected system workflows are
   * organization-visible even when their executable row is owned by the org
   * bootstrap user.
   */
  async findVisibleOrThrow(
    workflowId: string,
    scope: { organization: string; user: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      _id: workflowId,
      isDeleted: false,
      organization: scope.organization,
      OR: [
        { user: scope.user },
        {
          metadata: {
            equals: 'organization',
            path: [SYSTEM_WORKFLOW_METADATA_KEY, 'visibility'],
          },
        },
      ],
    });

    if (!workflow) {
      throw new NotFoundException('Workflow');
    }

    return workflow;
  }

  /**
   * Fetch a workflow the caller may mutate. System workflows are inspectable and
   * duplicable, but canonical rows are immutable.
   */
  async findMutableOwnedOrThrow(
    workflowId: string,
    scope: { organization: string; user?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOwnedOrThrow(workflowId, scope);
    this.assertWorkflowMutable(workflow);
    return workflow;
  }

  /**
   * Generate a webhook URL for a workflow
   */
  @HandleErrors('generate webhook', 'workflows')
  async generateWebhook(
    workflowId: string,
    authType: 'none' | 'secret' | 'bearer' = 'secret',
  ): Promise<{
    webhookId: string;
    webhookUrl: string;
    webhookSecret: string | null;
    authType: 'none' | 'secret' | 'bearer';
  }> {
    const webhookId = this.generateWebhookId();
    const webhookSecret =
      authType !== 'none' ? this.generateWebhookSecret() : null;
    const baseUrl = process.env.API_URL || 'https://api.genfeed.ai';

    await this.patchWorkflowConfig(workflowId, {
      webhookAuthType: authType,
      webhookId,
      webhookSecret,
    });

    return {
      authType,
      webhookId,
      webhookSecret,
      webhookUrl: `${baseUrl}/v1/webhooks/${webhookId}`,
    };
  }

  /**
   * Regenerate webhook secret
   */
  @HandleErrors('regenerate webhook secret', 'workflows')
  async regenerateWebhookSecret(
    workflowId: string,
  ): Promise<{ webhookSecret: string }> {
    const webhookSecret = this.generateWebhookSecret();

    await this.patchWorkflowConfig(workflowId, { webhookSecret });

    return { webhookSecret };
  }

  /**
   * Delete webhook configuration
   */
  @HandleErrors('delete webhook', 'workflows')
  async deleteWebhook(workflowId: string): Promise<void> {
    await this.patchWorkflowConfig(workflowId, {
      webhookAuthType: 'secret',
      webhookId: null,
      webhookLastTriggeredAt: null,
      webhookSecret: null,
      webhookTriggerCount: 0,
    });
  }

  /**
   * Find workflow by webhook ID (for public trigger endpoint)
   */
  @HandleErrors('find by webhook', 'workflows')
  async findByWebhookId(webhookId: string): Promise<WorkflowDocument | null> {
    const workflows = await this.prisma.workflow.findMany({
      select: { config: true, id: true },
      where: { isDeleted: false },
    });

    const match = workflows.find((workflow) => {
      const config = this.getWorkflowConfigRecord(workflow.config);
      return config.webhookId === webhookId;
    });

    if (!match) {
      return null;
    }

    return this.findOne({
      _id: match.id,
      isDeleted: false,
    });
  }

  /**
   * Trigger workflow via webhook
   */
  @HandleErrors('trigger via webhook', 'workflows')
  async triggerViaWebhook(
    webhookId: string,
    payload: Record<string, unknown>,
  ): Promise<{ runId: string; status: string }> {
    const workflow = await this.findByWebhookId(webhookId);

    if (!workflow) {
      throw new NotFoundException('Webhook not found or workflow deleted');
    }

    // Update webhook stats
    const currentWebhookTriggerCount =
      typeof workflow.webhookTriggerCount === 'number'
        ? workflow.webhookTriggerCount
        : 0;
    await this.patchWorkflowConfig(workflow._id.toString(), {
      webhookLastTriggeredAt: new Date().toISOString(),
      webhookTriggerCount: currentWebhookTriggerCount + 1,
    });

    if (!workflow.user || !workflow.organization) {
      throw new Error(
        'Systemic workflow templates cannot be executed directly. Clone the workflow first.',
      );
    }

    if (!this.shouldUseNodeExecutor(workflow)) {
      await this.executeWorkflow(workflow._id.toString());
      return {
        runId: workflow._id.toString(),
        status: 'started',
      };
    }

    if (!this.workflowExecutorService) {
      throw new Error(
        'Workflow executor service is not available - cannot trigger workflow',
      );
    }

    const result = await this.workflowExecutorService.executeManualWorkflow(
      workflow._id.toString(),
      workflow.user.toString(),
      workflow.organization.toString(),
      payload,
      {
        triggerSource: 'webhook',
        webhookId,
      },
      WorkflowExecutionTrigger.API,
    );

    return {
      runId: result.executionId,
      status: result.status,
    };
  }

  private shouldUseNodeExecutor(
    workflow:
      | Pick<WorkflowDocument, 'nodes'>
      | Pick<WorkflowEntity, 'nodes'>
      | null
      | undefined,
  ): boolean {
    return Array.isArray(workflow?.nodes) && workflow.nodes.length > 0;
  }

  private mapExecutionNodeStatus(status: string): WorkflowExecutionStatus {
    switch (status) {
      case 'pending':
        return WorkflowExecutionStatus.PENDING;
      case 'running':
        return WorkflowExecutionStatus.RUNNING;
      case 'completed':
      case 'skipped':
        return WorkflowExecutionStatus.COMPLETED;
      case 'failed':
        return WorkflowExecutionStatus.FAILED;
      default:
        return WorkflowExecutionStatus.PENDING;
    }
  }

  private findFirstFailedNodeId(
    result: ExecutionRunResult,
  ): string | undefined {
    for (const [nodeId, nodeResult] of result.nodeResults) {
      if (nodeResult.status === 'failed') {
        return nodeId;
      }
    }

    return undefined;
  }

  /**
   * Generate a unique webhook ID
   */
  private generateWebhookId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `wh_${timestamp}_${random}`;
  }

  private getWorkflowConfigRecord(config: unknown): Record<string, unknown> {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      return { ...(config as Record<string, unknown>) };
    }

    return {};
  }

  private async patchWorkflowConfig(
    workflowId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const workflow = await findOrThrow(
      this.prisma.workflow,
      {
        select: { config: true, id: true },
        where: { id: workflowId, isDeleted: false },
      },
      'Workflow',
    );

    const nextConfig = {
      ...this.getWorkflowConfigRecord(workflow.config),
      ...updates,
    };

    await this.prisma.workflow.update({
      data: {
        config: nextConfig as never,
      },
      where: { id: workflow.id },
    });
  }

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = 'whsec_';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }
}
