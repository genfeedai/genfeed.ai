import type { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  isUniqueConstraintViolation,
  type PlatformSeedReconcileOutcome,
  reconcilePlatformSeedMarker,
} from '@api/collections/workflows/services/workflow-platform-seed-reconcile.util';
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
import {
  isPlatformScheduledTemplate,
  PLATFORM_SEED_TEMPLATE_SETS,
  type PlatformSeedTemplateSet,
  type SeedableWorkflowTemplate,
} from '@api/collections/workflows/utils/workflow-platform-seed.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { WorkflowLifecycle, WorkflowStatus } from '@genfeedai/contracts';
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
   * Idempotent insert keyed on `metadata.sourceTemplateId` within an organization. A template
   * that ships a canonical cron is written as a platform workflow (see
   * {@link WorkflowsService.createPlatformSeeded}); an existing row is reconciled instead, so a
   * row seeded before the marker existed is marked here once it provably matches the template.
   * The partial unique index on (organizationId, platformSeedKey) settles two concurrent
   * seeders: the loser sees a unique violation and treats the workflow as already seeded.
   */
  private async ensureSeededWorkflow(input: {
    createData: Record<string, unknown>;
    logContext: string;
    logMeta: Record<string, unknown>;
    organizationId: string;
    sourceTemplateId: string;
    template: SeedableWorkflowTemplate;
    userId: string;
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
      await reconcilePlatformSeedMarker(
        { logger: this.logger, prisma: this.prisma },
        {
          organizationId: input.organizationId,
          template: input.template,
          userId: input.userId,
        },
      );
      return;
    }

    try {
      await this.createSeededWorkflow(input);
    } catch (error: unknown) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }
      this.logger?.debug('Seeded workflow was created concurrently', {
        ...input.logMeta,
        logContext: input.logContext,
      });
    }

    await this.reconcileDesiredSystemWorkflowDuplicates(
      input.organizationId,
      input.createData.metadata,
    );
  }

  private async createSeededWorkflow(input: {
    createData: Record<string, unknown>;
    template: SeedableWorkflowTemplate;
  }): Promise<void> {
    const createDto = input.createData as unknown as CreateWorkflowDto;
    if (isPlatformScheduledTemplate(input.template)) {
      await this.workflowsService.createPlatformSeeded(
        createDto,
        input.template.id,
      );
      return;
    }
    await this.workflowsService.create(createDto);
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
    logContext: string;
    organizationId: string;
    set: PlatformSeedTemplateSet & { templates: readonly T[] };
    userId: string;
  }): Promise<void> {
    for (const template of input.set.templates) {
      await this.ensureSeededWorkflow({
        createData: this.buildSeededTemplateCreateData({
          extraMetadata: input.buildExtraMetadata?.(template),
          lifecycle: input.set.lifecycle,
          organizationId: input.organizationId,
          sourceIssue: input.set.sourceIssue,
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
        template,
        userId: input.userId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.adAutomation,
      logContext: 'ensureAdAutomationWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.campaignOrchestration,
      logContext: 'ensureCampaignOrchestrationWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.outreachCampaignDispatch,
      logContext: 'ensureOutreachCampaignDispatchWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.agentAutopilot,
      logContext: 'ensureAgentAutopilotWorkflows',
      organizationId,
      userId,
    });
  }

  /**
   * Operator helper: install the analytics sync catalog set for one
   * organization. Not called from deploy or signup.
   */
  async ensureContentLearningWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      set: PLATFORM_SEED_TEMPLATE_SETS.contentLearning,
      logContext: 'ensureContentLearningWorkflows',
      organizationId,
      userId,
    });
  }

  async ensureAnalyticsSyncWorkflows(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    await this.ensureSeededTemplateWorkflows({
      set: PLATFORM_SEED_TEMPLATE_SETS.analyticsSync,
      logContext: 'ensureAnalyticsSyncWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.contentProduction,
      logContext: 'ensureContentProductionWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.contentLoopAutopilot,
      logContext: 'ensureContentLoopAutopilotWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.replyPolling,
      logContext: 'ensureReplyPollingWorkflows',
      organizationId,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.trendNotification,
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
      set: PLATFORM_SEED_TEMPLATE_SETS.livestreamBot,
      logContext: 'ensureLivestreamBotWorkflows',
      organizationId,
      userId,
    });
  }

  /**
   * Marks the rows an earlier seed run left in one organization as platform workflows, without
   * creating anything. Cloud does this by itself: the scheduler marks a qualifying row right
   * before it fires (`reconcileSeededWorkflowBeforeScheduledRun`), so this is only an
   * eager, whole-organization pass for an operator who wants paused rows marked too. `userId` is
   * the seeding user the caller names (the organization owner); a row is marked only if it
   * belongs to that user and still matches its catalog template exactly (see
   * {@link reconcilePlatformSeedMarker}). Never infer the marker from metadata: tenants can forge
   * it. It never re-enables a paused schedule.
   */
  async reconcilePlatformSeedMarkers(
    userId: string,
    organizationId: string,
  ): Promise<Record<string, PlatformSeedReconcileOutcome>> {
    const outcomes: Record<string, PlatformSeedReconcileOutcome> = {};

    for (const set of Object.values(PLATFORM_SEED_TEMPLATE_SETS)) {
      for (const template of set.templates) {
        outcomes[template.id] = await reconcilePlatformSeedMarker(
          { logger: this.logger, prisma: this.prisma },
          { organizationId, template, userId },
        );
      }
    }

    return outcomes;
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
