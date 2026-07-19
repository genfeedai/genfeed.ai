import { type WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import { SYSTEM_WORKFLOW_ACTION_DEFINITIONS } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { areWorkflowMetadataValuesEqual } from '@api/collections/workflows/services/workflow-template-seeder-metadata.util';
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
import {
  CONTENT_PRODUCTION_WORKFLOW_TEMPLATES,
  CONTENT_SCHEDULE_WORKFLOW_TEMPLATE_ID,
} from '@api/collections/workflows/templates/content-production-workflows.template';
import { DAILY_TRENDS_DIGEST_TEMPLATE } from '@api/collections/workflows/templates/daily-trends-digest.template';
import { LIVESTREAM_BOT_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/livestream-bot-workflows.template';
import { REPLY_POLLING_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/reply-polling-workflows.template';
import { TREND_NOTIFICATION_WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/trend-notification-workflows.template';
import { type WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

/** Template id for the predetermined per-org Daily Trends Digest workflow. */
const DAILY_TRENDS_DIGEST_TEMPLATE_ID = 'daily-trends-digest';

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

  /**
   * Refreshes version visibility for editable workflows duplicated from a
   * canonical system workflow. Only provenance metadata changes; user-owned
   * workflow content, scheduling, lifecycle, and ownership stay untouched.
   */
  async reconcileSystemWorkflowDuplicates(
    organizationId: string,
    currentSystemWorkflow: SystemWorkflowMetadata,
  ): Promise<void> {
    const duplicates = await this.prisma.workflow.findMany({
      select: { id: true, metadata: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: currentSystemWorkflow.canonicalId,
          path: [SYSTEM_WORKFLOW_DUPLICATE_METADATA_KEY, 'canonicalId'],
        },
        organizationId,
      },
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
          },
        } as never,
        where: {
          id: duplicate.id,
          isDeleted: false,
          metadata: { equals: duplicate.metadata } as never,
          organizationId,
        },
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
    const where = {
      isDeleted: false,
      metadata: {
        equals: input.sourceTemplateId,
        path: ['sourceTemplateId'],
      },
      organizationId: input.organizationId,
    };

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
          data: { metadata: metadataPatch } as never,
          where: { id: preCheck.id },
        });
      }
      await this.reconcileDesiredSystemWorkflowDuplicates(
        input.organizationId,
        input.createData.metadata,
      );
      return;
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.workflow.findFirst({
            select: { id: true, metadata: true },
            where,
          });

          if (existing) {
            const metadataPatch = this.buildSeededWorkflowMetadataPatch({
              desiredMetadata: input.createData.metadata,
              existingMetadata: existing.metadata,
            });

            if (metadataPatch) {
              await tx.workflow.update({
                data: { metadata: metadataPatch } as never,
                where: { id: existing.id },
              });
            }
            return;
          }

          await tx.workflow.create({
            data: input.createData as never,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        this.logger?.debug(
          `${input.logContext}: serialization conflict - workflow already seeded by concurrent request`,
          input.logMeta,
        );
      } else {
        throw error;
      }
    }

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
      edges: (template.edges ?? []) as never,
      executionCount: 0,
      inputVariables: (template.inputVariables ?? []) as never,
      isDeleted: false,
      isScheduleEnabled: true,
      label: template.name,
      lifecycle: input.lifecycle,
      metadata: this.buildSeededSystemWorkflowMetadata({
        extra: input.extraMetadata,
        sourceIssue,
        sourceTemplateId: template.id,
      }),
      nodes: (template.nodes ?? []) as never,
      organizationId,
      progress: 0,
      schedule: template.schedule,
      status: WorkflowStatus.ACTIVE,
      steps: (template.steps ?? []) as never,
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
   * Idempotently seeds the predetermined "Daily Trends Digest" workflow for an
   * organization. Seeded ON (`isScheduleEnabled: true`) so the workflow is the
   * default recurring automation path for every organization. Unlike the
   * template seeders below, an existing row that was toggled off is repaired
   * back to enabled.
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

    const createData = this.buildDailyTrendsDigestCreateData(
      userId,
      organizationId,
    );

    // Fast path: most calls hit an already-seeded org.
    const preCheck = await this.prisma.workflow.findFirst({
      select: { id: true, isScheduleEnabled: true, metadata: true },
      where,
    });

    if (preCheck) {
      const metadataPatch = this.buildSeededWorkflowMetadataPatch({
        desiredMetadata: createData.metadata,
        existingMetadata: preCheck.metadata,
      });
      if (!preCheck.isScheduleEnabled || metadataPatch) {
        await this.prisma.workflow.update({
          data: {
            ...(metadataPatch ? { metadata: metadataPatch } : {}),
            ...(!preCheck.isScheduleEnabled ? { isScheduleEnabled: true } : {}),
          } as never,
          where: { id: preCheck.id },
        });
      }
      await this.reconcileDesiredSystemWorkflowDuplicates(
        organizationId,
        createData.metadata,
      );
      return;
    }

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.workflow.findFirst({
            select: { id: true, isScheduleEnabled: true, metadata: true },
            where,
          });

          if (existing) {
            const metadataPatch = this.buildSeededWorkflowMetadataPatch({
              desiredMetadata: createData.metadata,
              existingMetadata: existing.metadata,
            });
            if (!existing.isScheduleEnabled || metadataPatch) {
              await tx.workflow.update({
                data: {
                  ...(metadataPatch ? { metadata: metadataPatch } : {}),
                  ...(!existing.isScheduleEnabled
                    ? { isScheduleEnabled: true }
                    : {}),
                } as never,
                where: { id: existing.id },
              });
            }
            return;
          }

          await tx.workflow.create({
            data: createData as never,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'P2034') {
        this.logger?.debug(
          'ensureDailyTrendsDigestWorkflow: serialization conflict - workflow already seeded by concurrent request',
          { organizationId },
        );
      } else {
        throw error;
      }
    }

    await this.reconcileDesiredSystemWorkflowDuplicates(
      organizationId,
      createData.metadata,
    );
  }

  private buildDailyTrendsDigestCreateData(
    userId: string,
    organizationId: string,
  ): Record<string, unknown> {
    return {
      edges: DAILY_TRENDS_DIGEST_TEMPLATE.edges as never,
      executionCount: 0,
      isDeleted: false,
      isScheduleEnabled: true,
      label: 'Daily Trends Digest',
      metadata: this.buildSeededSystemWorkflowMetadata({
        changeSummary: DAILY_TRENDS_DIGEST_TEMPLATE.changeSummary,
        sourceIssue: 1011,
        sourceTemplateId: DAILY_TRENDS_DIGEST_TEMPLATE_ID,
        version: DAILY_TRENDS_DIGEST_TEMPLATE.version,
      }),
      nodes: DAILY_TRENDS_DIGEST_TEMPLATE.nodes as never,
      organizationId,
      progress: 0,
      schedule: '0 7 * * *',
      status: WorkflowStatus.ACTIVE,
      steps: [],
      timezone: 'UTC',
      userId,
    };
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
   * Idempotently seeds the default-on campaign orchestration workflow set for
   * an organization. The workflow actions preserve the previous cron scanner
   * behavior by filtering eligible campaigns inside the node execution.
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
   * Idempotently seeds the default-on recurring agent automation workflow set
   * for an organization. The workflow nodes preserve the previous cron scanner
   * behavior by filtering active strategies/personas inside execution.
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
   * Idempotently seeds the default-on analytics sync workflow set for an
   * organization. Nodes preserve previous cron behavior by dispatching existing
   * provider queue jobs scoped to the workflow organization.
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
   * Idempotently seeds the default-on content production workflow set for an
   * organization. Existing content schedules are mirrored into workflow rows
   * with their own cron expression/timezone and enabled state.
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
   * Idempotently seeds default-on reply/social polling workflow schedules for
   * an organization. Nodes preserve the previous cron scanner behavior by
   * discovering active reply configs and workflow social trigger nodes during
   * execution, scoped to the workflow organization.
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
   * Idempotently seeds default-on trend notification workflow schedules for an
   * organization. Each cadence executor checks the org owner's current settings
   * at run time, preserving legacy frequency/recipient semantics while letting
   * workflow schedule toggles pause the tenant-facing notification path.
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
   * Idempotently seeds default-on livestream bot active-session processing for
   * an organization. The executor preserves the previous per-minute cron scan
   * while keeping execution scoped to the workflow organization.
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
      await this.ensureSeededWorkflow({
        createData: {
          description: definition.description,
          edges: [],
          executionCount: 0,
          inputVariables: [],
          isDeleted: false,
          // Schedule is display metadata only: system actions fire from the
          // workers sweep scheduler, never from the user-workflow scheduler
          // (no engine executor exists for systemWorkflowAction nodes).
          isScheduleEnabled: false,
          label: definition.label,
          metadata: this.buildSeededSystemWorkflowMetadata({
            changeSummary: definition.changeSummary,
            sourceIssue: 1011,
            sourceTemplateId: definition.canonicalId,
            sourceType: 'system-action-workflow',
            version: definition.version,
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
        },
        logContext: 'ensureSystemActionWorkflows',
        logMeta: { definitionId: definition.canonicalId, organizationId },
        organizationId,
        sourceTemplateId: definition.canonicalId,
      });
    }
  }

  /**
   * Mirrors a content schedule into its workflow-backed row: creates the
   * workflow when missing, otherwise syncs cron/timezone/enabled state onto the
   * existing row. A vanished schedule disables the mirrored workflow.
   */
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
      const synced = await this.prisma.workflow.update({
        data,
        select: WORKFLOW_SCHEDULER_SYNC_SELECT,
        where: { id: existing.id },
      });
      await this.workflowExecutionQueueService?.syncWorkflowScheduler(synced);
      return;
    }

    await this.upsertContentScheduleWorkflow({
      contentScheduleId,
      data,
      organizationId,
      userId,
      where,
    });
  }

  /**
   * Race-safe create-or-sync for a content-schedule-backed workflow: inside a
   * SERIALIZABLE transaction, a row inserted by a concurrent caller is updated
   * instead of duplicated, and a serialization failure (P2034) means the
   * concurrent caller already synced it.
   */
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
      where: {
        isDeleted: false,
        isScheduleEnabled: true,
        organizationId,
        schedule: { not: null },
        status: WorkflowStatus.ACTIVE,
      },
    });

    for (const workflow of workflows) {
      await this.workflowExecutionQueueService.syncWorkflowScheduler(workflow);
    }
  }

  private async upsertContentScheduleWorkflow(input: {
    contentScheduleId: string;
    data: Record<string, unknown>;
    organizationId: string;
    userId: string;
    where: Record<string, unknown>;
  }): Promise<void> {
    const { contentScheduleId, data, organizationId, userId, where } = input;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const concurrent = await tx.workflow.findFirst({
            select: { id: true },
            where: where as never,
          });

          if (concurrent) {
            await tx.workflow.update({
              data: data as never,
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
            } as never,
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode !== 'P2034') {
        throw error;
      }

      this.logger?.debug(
        'ensureContentScheduleWorkflow: serialization conflict - workflow already synced by concurrent request',
        { contentScheduleId, organizationId },
      );
    }

    // Sync the BullMQ job scheduler from the row's post-write state (covers
    // both the update and create paths, including a concurrent writer's row).
    const synced = await this.prisma.workflow.findFirst({
      select: WORKFLOW_SCHEDULER_SYNC_SELECT,
      where: where as never,
    });

    if (synced) {
      await this.workflowExecutionQueueService?.syncWorkflowScheduler(synced);
    }
  }

  async disableContentScheduleWorkflow(
    organizationId: string,
    contentScheduleId: string,
  ): Promise<void> {
    const affected = await this.prisma.workflow.findMany({
      select: { id: true },
      where: {
        isDeleted: false,
        metadata: {
          equals: contentScheduleId,
          path: ['contentScheduleId'],
        },
        organizationId,
      },
    });

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

    // Drop the BullMQ job schedulers so the disabled schedules stop firing.
    for (const workflow of affected) {
      await this.workflowExecutionQueueService?.syncWorkflowScheduler({
        id: workflow.id,
        isDeleted: true,
      });
    }
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
      brandId: schedule.brandId,
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
}
