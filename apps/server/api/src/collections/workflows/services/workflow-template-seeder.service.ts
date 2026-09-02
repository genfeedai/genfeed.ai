import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { areWorkflowMetadataValuesEqual } from '@api/collections/workflows/services/workflow-template-seeder-metadata.util';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import {
  buildSystemWorkflowMetadata,
  buildSystemWorkflowUpgradeMetadata,
  getMetadataRecord,
  getSystemWorkflowDuplicateMetadata,
  getSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY,
  SYSTEM_WORKFLOW_METADATA_KEY,
  SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY,
  SYSTEM_WORKFLOW_TEMPLATE_VERSION,
  type SystemWorkflowMetadata,
} from '@api/collections/workflows/system-workflow.contract';
import { AD_AUTOMATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/ad-automation-workflows.template';
import { AGENT_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/agent-autopilot-workflows.template';
import { ANALYTICS_SYNC_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/analytics-sync-workflows.template';
import { CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/campaign-orchestration-workflows.template';
import { CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-loop-autopilot-workflows.template';
import { CONTENT_PRODUCTION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/content-production-workflows.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/outreach-campaign-dispatch-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { type WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

const WORKFLOW_SCHEDULER_SYNC_SELECT = {
  id: true,
  isDeleted: true,
  isScheduleEnabled: true,
  metadata: true,
  schedule: true,
  status: true,
  timezone: true,
} as const;

type SeedableWorkflowTemplate = WorkflowTemplate & { schedule?: string };

/**
 * Idempotent seeding of system workflows for an organization.
 *
 * Every seeder follows the same race-safe shape: a fast-path read for an
 * already-seeded row, then a SERIALIZABLE check-and-insert transaction so two
 * concurrent callers cannot both insert. A serialization failure (P2034) means
 * a concurrent caller already seeded the workflow and is treated as success.
 *
 * Split out of `WorkflowsService` (#754) so seeding concerns no longer share a
 * class with workflow CRUD and execution.
 */
@Injectable()
export class WorkflowTemplateSeederService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly workflowsService: WorkflowsService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
  ) {}

  private buildSeededSystemWorkflowMetadata(input: {
    changeSummary?: string;
    extra?: Record<string, unknown>;
    sourceIssue: number;
    sourceTemplateId: string;
    sourceType?: string;
    version?: number;
  }): Record<string, unknown> {
    const sourceTemplateVersion =
      input.version ?? SYSTEM_WORKFLOW_TEMPLATE_VERSION;
    const sourceTemplateChangeSummary =
      input.changeSummary ?? SYSTEM_WORKFLOW_TEMPLATE_CHANGE_SUMMARY;

    return {
      ...(input.extra ?? {}),
      sourceIssue: input.sourceIssue,
      sourceTemplateChangeSummary,
      sourceTemplateId: input.sourceTemplateId,
      sourceTemplateVersion,
      sourceType: input.sourceType ?? 'seeded-template',
      [SYSTEM_WORKFLOW_METADATA_KEY]: buildSystemWorkflowMetadata({
        canonicalId: input.sourceTemplateId,
        changeSummary: sourceTemplateChangeSummary,
        sourceIssue: input.sourceIssue,
        version: sourceTemplateVersion,
      }),
    };
  }

  private buildSeededWorkflowMetadataPatch(input: {
    desiredMetadata: unknown;
    existingMetadata: unknown;
  }): Record<string, unknown> | null {
    const desiredMetadata = getMetadataRecord(input.desiredMetadata);
    const desiredSystemWorkflow = getSystemWorkflowMetadata(desiredMetadata);

    if (!desiredSystemWorkflow) {
      return null;
    }

    const existingMetadata = getMetadataRecord(input.existingMetadata);
    const existingSystemWorkflow = getSystemWorkflowMetadata(existingMetadata);
    const repairedMetadata = { ...existingMetadata, ...desiredMetadata };

    if (!existingSystemWorkflow) {
      return repairedMetadata;
    }

    const existingSourceVersion = this.normalizeSeededWorkflowVersion(
      existingMetadata.sourceTemplateVersion,
    );
    const desiredSourceVersion = this.normalizeSeededWorkflowVersion(
      desiredMetadata.sourceTemplateVersion,
    );
    const existingSystemVersion = this.normalizeSeededWorkflowVersion(
      existingSystemWorkflow.version,
    );
    const desiredSystemVersion = this.normalizeSeededWorkflowVersion(
      desiredSystemWorkflow.version,
    );

    if (
      existingSourceVersion < desiredSourceVersion ||
      existingSystemVersion < desiredSystemVersion
    ) {
      return repairedMetadata;
    }

    for (const [key, value] of Object.entries(desiredMetadata)) {
      if (!areWorkflowMetadataValuesEqual(existingMetadata[key], value)) {
        return repairedMetadata;
      }
    }

    return null;
  }

  private normalizeSeededWorkflowVersion(version: unknown): number {
    return typeof version === 'number' &&
      Number.isInteger(version) &&
      version > 0
      ? version
      : 0;
  }

  async reconcileSystemWorkflowDuplicates(
    organizationId: string,
    currentSystemWorkflow: SystemWorkflowMetadata,
  ): Promise<void> {
    const duplicates = await this.prisma.workflow.findMany({
      select: { id: true, metadata: true },
      where: scopedWhere(organizationId, {
        metadata: {
          equals: currentSystemWorkflow.canonicalId,
          path: [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY, 'canonicalId'],
        },
      }),
    });

    for (const duplicate of duplicates) {
      const metadata = getMetadataRecord(duplicate.metadata);
      const duplicateMetadata = getSystemWorkflowDuplicateMetadata(metadata);

      if (
        !duplicateMetadata ||
        duplicateMetadata.canonicalId !== currentSystemWorkflow.canonicalId
      ) {
        this.logger?.debug(
          'Skipped system workflow duplicate reconciliation for invalid provenance',
          {
            canonicalId: currentSystemWorkflow.canonicalId,
            organizationId,
            workflowId: duplicate.id,
          },
        );
        continue;
      }

      const reconciledMetadata = buildSystemWorkflowUpgradeMetadata(
        duplicateMetadata,
        currentSystemWorkflow,
      );

      if (
        areWorkflowMetadataValuesEqual(duplicateMetadata, reconciledMetadata)
      ) {
        continue;
      }

      const { count } = await this.prisma.workflow.updateMany({
        data: {
          metadata: {
            ...metadata,
            [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY]: reconciledMetadata,
          } as Prisma.InputJsonValue,
        },
        where: scopedWhere(organizationId, {
          id: duplicate.id,
          metadata: { equals: duplicate.metadata as Prisma.InputJsonValue },
        }),
      });

      if (count === 0) {
        this.logger?.debug(
          'System workflow duplicate metadata changed before reconciliation; retrying on a later seed pass',
          {
            canonicalId: currentSystemWorkflow.canonicalId,
            organizationId,
            workflowId: duplicate.id,
          },
        );
      }
    }
  }

  private async reconcileDesiredSystemWorkflowDuplicates(
    organizationId: string,
    metadata: unknown,
  ): Promise<void> {
    const currentSystemWorkflow = getSystemWorkflowMetadata(metadata);

    if (currentSystemWorkflow) {
      await this.reconcileSystemWorkflowDuplicates(
        organizationId,
        currentSystemWorkflow,
      );
    }
  }

  /**
   * Race-safe idempotent insert keyed on `metadata.sourceTemplateId` within an
   * organization. Fast-path read first; otherwise a SERIALIZABLE re-check +
   * create where both operations use the same `tx` client so Postgres can
   * detect a concurrent conflicting write and serialise the two callers.
   */
  private async ensureSeededWorkflow(input: {
    createData: Record<string, unknown>;
    logContext: string;
    logMeta: Record<string, unknown>;
    organizationId: string;
    sourceTemplateId: string;
  }): Promise<void> {
    const where = scopedWhere(input.organizationId, {
      metadata: {
        equals: input.sourceTemplateId,
        path: ['sourceTemplateId'],
      },
    });

    const preCheck = await this.prisma.workflow.findFirst({
      select: { id: true, metadata: true },
      where,
    });

    if (preCheck) {
      const metadataPatch = this.buildSeededWorkflowMetadataPatch({
        desiredMetadata: input.createData.metadata,
        existingMetadata: preCheck.metadata,
      });

      if (metadataPatch) {
        await this.prisma.workflow.update({
          data: { metadata: metadataPatch as Prisma.InputJsonValue },
          where: scopedWhere(input.organizationId, { id: preCheck.id }),
        });
      }
      await this.reconcileDesiredSystemWorkflowDuplicates(
        input.organizationId,
        input.createData.metadata,
      );
      return;
    }

    await this.workflowsService.create(
      input.createData as unknown as CreateWorkflowDto,
    );

    await this.reconcileDesiredSystemWorkflowDuplicates(
      input.organizationId,
      input.createData.metadata,
    );
  }

  private buildSeededTemplateCreateData(input: {
    extraMetadata?: Record<string, unknown>;
    lifecycle?: WorkflowLifecycle;
    organizationId: string;
    sourceIssue: number;
    template: SeedableWorkflowTemplate;
    userId: string;
  }): Record<string, unknown> {
    const { organizationId, sourceIssue, template, userId } = input;

    return {
      description: template.description,
      edges: (template.edges ?? []) as Prisma.InputJsonValue,
      executionCount: 0,
      inputVariables: (template.inputVariables ?? []) as Prisma.InputJsonValue,
      isDeleted: false,
      isScheduleEnabled: true,
      label: template.name,
      lifecycle: input.lifecycle,
      metadata: this.buildSeededSystemWorkflowMetadata({
        extra: input.extraMetadata,
        sourceIssue,
        sourceTemplateId: template.id,
      }),
      nodes: (template.nodes ?? []) as Prisma.InputJsonValue,
      organizationId,
      progress: 0,
      schedule: template.schedule,
      status: WorkflowStatus.ACTIVE,
      timezone: 'UTC',
      userId,
    };
  }

  private async ensureSeededTemplateWorkflows<
    T extends SeedableWorkflowTemplate,
  >(input: {
    buildExtraMetadata?: (template: T) => Record<string, unknown>;
    lifecycle?: WorkflowLifecycle;
    logContext: string;
    organizationId: string;
    sourceIssue: number;
    templates: readonly T[];
    userId: string;
  }): Promise<void> {
    for (const template of input.templates) {
      await this.ensureSeededWorkflow({
        createData: this.buildSeededTemplateCreateData({
          extraMetadata: input.buildExtraMetadata?.(template),
          lifecycle: input.lifecycle,
          organizationId: input.organizationId,
          sourceIssue: input.sourceIssue,
          template,
          userId: input.userId,
        }),
        logContext: input.logContext,
        logMeta: {
          organizationId: input.organizationId,
          templateId: template.id,
        },
        organizationId: input.organizationId,
        sourceTemplateId: template.id,
      });
    }
  }

  /**
   * Operator helper: install the ad automation catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureAdAutomationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      lifecycle: WorkflowLifecycle.PUBLISHED,
      logContext: 'ensureAdAutomationWorkflows',
      organizationId,
      sourceIssue: 782,
      templates: AD_AUTOMATION_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the campaign orchestration catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureCampaignOrchestrationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureCampaignOrchestrationWorkflows',
      organizationId,
      sourceIssue: 783,
      templates: CAMPAIGN_ORCHESTRATION_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the outreach campaign dispatch catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureOutreachCampaignDispatchWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureOutreachCampaignDispatchWorkflows',
      organizationId,
      sourceIssue: 3407,
      templates: OUTREACH_CAMPAIGN_DISPATCH_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the agent autopilot catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureAgentAutopilotWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureAgentAutopilotWorkflows',
      organizationId,
      sourceIssue: 784,
      templates: AGENT_AUTOPILOT_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the analytics sync catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureAnalyticsSyncWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureAnalyticsSyncWorkflows',
      organizationId,
      sourceIssue: 785,
      templates: ANALYTICS_SYNC_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the content production catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureContentProductionWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureContentProductionWorkflows',
      organizationId,
      sourceIssue: 786,
      templates: CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the content loop autopilot catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureContentLoopAutopilotWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureContentLoopAutopilotWorkflows',
      organizationId,
      sourceIssue: 3018,
      templates: CONTENT_LOOP_AUTOPILOT_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the reply/social polling catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureReplyPollingWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureReplyPollingWorkflows',
      organizationId,
      sourceIssue: 787,
      templates: REPLY_POLLING_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the trend notification catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureTrendNotificationWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      buildExtraMetadata: (template) => ({ cadence: template.cadence }),
      logContext: 'ensureTrendNotificationWorkflows',
      organizationId,
      sourceIssue: 788,
      templates: TREND_NOTIFICATION_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Operator helper: install the livestream bot catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureLivestreamBotWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      logContext: 'ensureLivestreamBotWorkflows',
      organizationId,
      sourceIssue: 793,
      templates: LIVESTREAM_BOT_WORKFLOW_TEMPLATES,
      userId,
    });
  }

  /**
   * Upsert job schedulers for every enabled scheduled workflow of an
   * organization. Called after seeding batches (`ensure*Workflows`) so newly
   * seeded schedules fire without waiting for a service restart.
   */
  async syncOrganizationWorkflowSchedulers(
    organizationId: string,
  ): Promise<void> {
    if (!this.workflowExecutionQueueService) {
      return;
    }

    const workflows = await this.prisma.workflow.findMany({
      select: WORKFLOW_SCHEDULER_SYNC_SELECT,
      where: scopedWhere(organizationId, {
        isScheduleEnabled: true,
        schedule: { not: null },
        status: WorkflowStatus.ACTIVE,
      }),
    });

    for (const workflow of workflows) {
      await this.workflowExecutionQueueService.syncWorkflowScheduler(workflow);
    }
  }
}
