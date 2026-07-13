import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { type WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import { LegacyWorkflowStepRunner } from '@api/collections/workflows/services/legacy-workflow-step-runner.service';
import {
  WorkflowExecutionQueueService,
  type WorkflowSchedulerSyncRow,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import {
  buildSystemWorkflowDuplicateMetadata,
  isProtectedSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import {
  ListingType,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
  WorkflowStepCategory,
  WorkflowStepStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';

type WorkflowCreateExtras = CreateWorkflowDto & {
  brandId?: string | null;
  brands?: unknown;
  config?: Record<string, unknown>;
  defaultRecurringBrandId?: string | null;
  lifecycle?: string | null;
  lockedNodeIds?: string[];
};

/**
 * Core workflow service: CRUD/templating, lifecycle transitions, node locks,
 * and the ownership guards shared by the workflows controllers.
 *
 * Sibling concerns split out in #754:
 * - `WorkflowTemplateSeederService` — idempotent per-org system workflow seeding
 * - `LegacyWorkflowStepRunner` — step-based (pre-node) execution engine
 * - `WorkflowRunControlService` — partial runs, resume, credits, execution logs
 * - `WorkflowWebhookService` — inbound webhook credentials + trigger path
 */
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
    private readonly legacyWorkflowStepRunner?: LegacyWorkflowStepRunner,
    @Optional()
    private readonly workflowExecutorService?: WorkflowExecutorService,
    @Optional()
    private readonly workflowExecutionQueueService?: WorkflowExecutionQueueService,
    @Optional()
    private readonly marketplaceApiClient?: MarketplaceApiClient,
  ) {
    super(prisma, 'workflow', logger);
  }

  private assertWorkflowMutable(workflow: Pick<WorkflowDocument, 'metadata'>) {
    if (!isProtectedSystemWorkflowMetadata(workflow.metadata)) {
      return;
    }

    throw new ForbiddenException(
      'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
    );
  }

  private normalizeWorkflowBrandId(
    value: unknown,
    legacyBrands?: unknown,
    fallbackBrandId?: string,
  ): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    const rawLegacyValues = Array.isArray(legacyBrands)
      ? legacyBrands
      : typeof legacyBrands === 'string'
        ? [legacyBrands]
        : [];
    const legacyIds = rawLegacyValues
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object') {
          const record = entry as Record<string, unknown>;
          if (typeof record.id === 'string') {
            return record.id;
          }
          if (typeof record._id === 'string') {
            return record._id;
          }
        }
        return '';
      })
      .filter((id) => id.length > 0);

    return legacyIds[0] ?? fallbackBrandId;
  }

  private async assertWorkflowBrandAccess(
    brandId: string | undefined,
    organizationId: string,
  ): Promise<void> {
    if (!brandId) {
      return;
    }

    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in this organization',
      );
    }
  }

  private normalizeWorkflowStepsForCreate(
    steps: WorkflowDocument['steps'],
  ): CreateWorkflowDto['steps'] {
    return (steps ?? []).map((step) => {
      const category =
        typeof step.category === 'string' &&
        Object.values(WorkflowStepCategory).includes(
          step.category as WorkflowStepCategory,
        )
          ? (step.category as WorkflowStepCategory)
          : WorkflowStepCategory.TRANSFORM;

      return { ...step, category };
    });
  }

  private omitUndefinedPayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private buildWorkflowCreatePayload(input: {
    brandId?: string;
    defaultLabel: string;
    organizationId: string;
    steps: CreateWorkflowDto['steps'];
    userId: string;
    workflowData: WorkflowCreateExtras;
  }): Record<string, unknown> {
    const { brandId, defaultLabel, organizationId, steps, userId } = input;
    const workflowData = input.workflowData;

    return this.omitUndefinedPayload({
      brandId,
      config: workflowData.config,
      defaultRecurringBrandId: workflowData.defaultRecurringBrandId,
      description: workflowData.description,
      edges: workflowData.edges ?? [],
      executionCount: workflowData.executionCount ?? 0,
      inputVariables: workflowData.inputVariables ?? [],
      isScheduleEnabled: workflowData.isScheduleEnabled,
      label: workflowData.label || defaultLabel,
      lastExecutedAt: workflowData.lastExecutedAt,
      lifecycle: workflowData.lifecycle,
      lockedNodeIds: workflowData.lockedNodeIds,
      metadata: workflowData.metadata,
      nodes: workflowData.nodes ?? [],
      organizationId,
      progress: workflowData.progress ?? 0,
      recurrence: workflowData.recurrence,
      schedule: workflowData.schedule,
      startedAt: workflowData.startedAt,
      status: workflowData.status ?? WorkflowStatus.ACTIVE,
      steps: steps ?? [],
      thumbnail: workflowData.thumbnail,
      thumbnailNodeId: workflowData.thumbnailNodeId,
      timezone: workflowData.timezone,
      userId,
    });
  }

  private isMissingInputValue(value: unknown): boolean {
    return (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0)
    );
  }

  private getDefaultInputValuesFromWorkflowData(
    workflowData: Pick<CreateWorkflowDto, 'inputVariables'>,
  ): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};

    for (const variable of workflowData.inputVariables ?? []) {
      if (variable.defaultValue !== undefined) {
        defaults[variable.key] = variable.defaultValue;
      }
    }

    return defaults;
  }

  private getMissingRequiredInputKeys(
    workflowData: Pick<CreateWorkflowDto, 'inputVariables'>,
    inputValues: Record<string, unknown>,
  ): string[] {
    return (workflowData.inputVariables ?? [])
      .filter((variable) => {
        if (!variable.required) {
          return false;
        }

        return this.isMissingInputValue(inputValues[variable.key]);
      })
      .map((variable) => variable.key);
  }

  /**
   * Upsert or remove the BullMQ job scheduler for one workflow row based on
   * its current schedule/enabled/status state. No-ops when the queue service
   * is not wired (tests, contexts without BullMQ).
   */
  private async syncWorkflowScheduler(
    workflow: WorkflowSchedulerSyncRow,
  ): Promise<void> {
    await this.workflowExecutionQueueService?.syncWorkflowScheduler(workflow);
  }

  /**
   * Soft-delete a workflow and drop its BullMQ job scheduler so the schedule
   * stops firing immediately.
   */
  override async remove(id: string): Promise<WorkflowDocument | null> {
    const workflow = await this.findOne({
      _id: id,
      isDeleted: false,
    });
    if (workflow) {
      this.assertWorkflowMutable(workflow);
    }

    const removed = await super.remove(id);

    if (removed) {
      await this.syncWorkflowScheduler({ id, isDeleted: true });
    }

    return removed;
  }

  @HandleErrors('create workflow', 'workflows')
  async createWorkflow(
    userId: string,
    organizationId: string,
    workflowData: CreateWorkflowDto,
    defaultBrandId?: string,
  ): Promise<WorkflowEntity> {
    const templateMetadata = workflowData.templateId
      ? {
          sourceTemplateId: workflowData.templateId,
          sourceType: 'seeded-template',
        }
      : undefined;
    const { steps, workflowData: mergedWorkflowData } =
      this.applyTemplateDefaults(workflowData, templateMetadata);
    workflowData = mergedWorkflowData;

    const metadata =
      workflowData.metadata || templateMetadata
        ? {
            ...templateMetadata,
            ...(workflowData.metadata ?? {}),
          }
        : undefined;
    const brandId = this.normalizeWorkflowBrandId(
      (workflowData as WorkflowCreateExtras).brandId,
      (workflowData as WorkflowCreateExtras).brands,
      defaultBrandId,
    );
    await this.assertWorkflowBrandAccess(brandId, organizationId);

    const workflow = await this.create(
      this.buildWorkflowCreatePayload({
        brandId,
        defaultLabel: `Workflow: ${workflowData.templateId || 'Custom'}`,
        organizationId,
        steps,
        userId,
        workflowData: {
          ...(workflowData as WorkflowCreateExtras),
          metadata,
          status: workflowData.status ?? WorkflowStatus.ACTIVE,
        },
      }) as unknown as CreateWorkflowDto,
    );

    // Register the BullMQ job scheduler when the workflow is created with an
    // enabled schedule (template-seeded or explicit).
    await this.syncWorkflowScheduler(
      workflow as unknown as WorkflowSchedulerSyncRow,
    );

    // If trigger is manual, start execution immediately when all required
    // inputs have defaults. Required-input templates must wait for a run form.
    if ((workflowData.trigger as string) === 'manual') {
      const initialInputValues =
        this.getDefaultInputValuesFromWorkflowData(workflowData);
      const missingRequiredInputs = this.getMissingRequiredInputKeys(
        workflowData,
        initialInputValues,
      );

      if (missingRequiredInputs.length === 0) {
        this.executeWorkflowCompat(
          String(workflow.id),
          userId,
          organizationId,
          initialInputValues,
        ).catch((error) => {
          if (this.logger) {
            this.logger.error('Workflow execution failed', error);
          }
        });
      } else {
        this.logger?.warn?.(
          `Skipped initial workflow execution for ${String(workflow.id)} because required inputs are missing: ${missingRequiredInputs.join(', ')}`,
        );
      }
    }

    return EntityFactory.fromDocument(WorkflowEntity, workflow);
  }

  /**
   * When creating from a known template, fills edges/inputVariables/nodes/
   * schedule/timezone the caller left empty from the template and seeds the
   * template's steps as pending. Non-template creates pass through unchanged.
   */
  private applyTemplateDefaults(
    workflowData: CreateWorkflowDto,
    templateMetadata: Record<string, unknown> | undefined,
  ): { steps: CreateWorkflowDto['steps']; workflowData: CreateWorkflowDto } {
    if (
      !workflowData.templateId ||
      !WORKFLOW_TEMPLATES[workflowData.templateId]
    ) {
      return { steps: workflowData.steps || [], workflowData };
    }

    const template = WORKFLOW_TEMPLATES[workflowData.templateId];
    const routineMetadata = template.routine
      ? { productizedRoutine: template.routine }
      : {};
    const shouldUseTemplateEdges =
      !workflowData.edges || workflowData.edges.length === 0;
    const shouldUseTemplateInputVariables =
      !workflowData.inputVariables || workflowData.inputVariables.length === 0;
    const shouldUseTemplateNodes =
      !workflowData.nodes || workflowData.nodes.length === 0;

    return {
      steps: template.steps.map((step) => ({
        ...step,
        label: step.name,
        status: WorkflowStepStatus.PENDING,
      })),
      workflowData: {
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
      },
    };
  }

  /**
   * Dispatches a manual execution to the right engine: node-based workflows
   * run through `WorkflowExecutorService`, step-based workflows through the
   * `LegacyWorkflowStepRunner`.
   */
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
      if (!this.legacyWorkflowStepRunner) {
        throw new Error(
          'Legacy workflow step runner is not available - cannot execute step workflow',
        );
      }

      await this.legacyWorkflowStepRunner.executeWorkflow(workflowId);
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

  private shouldUseNodeExecutor(
    workflow:
      | Pick<WorkflowDocument, 'nodes'>
      | Pick<WorkflowEntity, 'nodes'>
      | null
      | undefined,
  ): boolean {
    return Array.isArray(workflow?.nodes) && workflow.nodes.length > 0;
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

    const brandId =
      targetBrandId ??
      this.normalizeWorkflowBrandId(
        workflowDoc.brandId,
        (workflowDoc as WorkflowCreateExtras).brands,
      );
    await this.assertWorkflowBrandAccess(brandId, organizationId);

    const clonedWorkflow = await this.create(
      this.buildWorkflowCreatePayload({
        brandId,
        defaultLabel: `${sourceLabel} (Copy)`,
        organizationId,
        steps: this.normalizeWorkflowStepsForCreate(workflowDoc.steps),
        userId,
        workflowData: {
          config: workflowDoc.config,
          defaultRecurringBrandId: isProtectedSystemWorkflow
            ? null
            : targetBrandId || workflowDoc.defaultRecurringBrandId || null,
          description: workflowDoc.description ?? undefined,
          edges: workflowDoc.edges,
          executionCount: 0,
          inputVariables: workflowDoc.inputVariables,
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
          nodes: workflowDoc.nodes,
          progress: 0,
          recurrence: undefined,
          schedule: isProtectedSystemWorkflow
            ? undefined
            : (workflowDoc.schedule ?? undefined),
          startedAt: undefined,
          status: WorkflowStatus.DRAFT,
          thumbnail: workflowDoc.thumbnail ?? undefined,
          thumbnailNodeId: workflowDoc.thumbnailNodeId ?? undefined,
          timezone: workflowDoc.timezone ?? undefined,
        },
      }) as unknown as CreateWorkflowDto,
    );

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
   * Publish a workflow to the marketplace: flip it public + template and, when
   * a seller profile and marketplace API are available, create and auto-submit
   * a marketplace listing. Cascade moved out of the former
   * `POST /workflows/:id/publish` controller so it lives behind the generic
   * `PATCH /workflows/:id { isPublic: true, isTemplate: true }` (#1354).
   */
  @HandleErrors('publish workflow to marketplace', 'workflows')
  async publishToMarketplace(
    workflowId: string,
    userId: string,
    organizationId: string,
  ): Promise<WorkflowEntity> {
    const workflow = await this.findMutableOwnedOrThrow(workflowId, {
      organization: organizationId,
      user: userId,
    });

    const updated = await this.patch(workflowId, {
      isPublic: true,
      isTemplate: true,
    });

    if (this.marketplaceApiClient) {
      const seller = await this.marketplaceApiClient.getSellerByUserId(userId);

      if (seller) {
        const nodes = workflow.nodes || [];
        const edges = workflow.edges || [];
        const nodeTypes = [...new Set(nodes.map((node) => node.type))];

        const listing = await this.marketplaceApiClient.createListing(
          seller._id.toString(),
          organizationId,
          {
            description:
              workflow.description ||
              workflow.name ||
              'A workflow published from the builder',
            downloadData: {
              edges,
              name: workflow.name,
              nodes,
              version: 1,
            },
            previewData: {
              connections: edges.length,
              nodes: nodes.length,
              nodeTypes,
            },
            price: 0,
            shortDescription:
              workflow.description?.slice(0, 300) ||
              workflow.name ||
              'Workflow',
            tags: ['community', 'workflow'],
            title: workflow.name || 'Untitled Workflow',
            type: ListingType.WORKFLOW,
          },
        );

        if (listing) {
          // Auto-approve (submit for review)
          await this.marketplaceApiClient.submitForReview(
            listing._id.toString(),
            seller._id.toString(),
          );
        }
      }
    }

    return EntityFactory.fromDocument(WorkflowEntity, updated);
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
}
