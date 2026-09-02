import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import { UpdateWorkflowDto } from '@api/collections/workflows/dto/update-workflow.dto';
import { WorkflowEntity } from '@api/collections/workflows/entities/workflow.entity';
import { type WorkflowDocument } from '@api/collections/workflows/schemas/workflow.schema';
import type { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import {
  buildWorkflowCreatePayload,
  getDefaultInputValuesFromWorkflowData,
  getMissingRequiredInputKeys,
  resolveWorkflowBrandId,
  WORKFLOW_CONFIG_FIELDS,
  type WorkflowCreateExtras,
} from '@api/collections/workflows/services/workflow-create-payload.util';
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
import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
  hydrateWorkflowDefinition,
  splitWorkflowDefinition,
  type VersionedWorkflowIdentityInput,
  WORKFLOW_DEFINITION_FIELDS,
} from '@api/collections/workflows/workflow-version-definition';
import { SYSTEM_WORKFLOW_CATALOG } from '@api/collections/workflows/workflows.tokens';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { scopedWhere } from '@api/index';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { EntityFactory } from '@api/shared/factories/entity/entity.factory';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  ListingType,
  WorkflowExecutionTrigger,
  WorkflowLifecycle,
  WorkflowStatus,
} from '@genfeedai/enums';
import type { PopulateOption } from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/**
 * Core workflow service: CRUD/templating, lifecycle transitions, node locks,
 * and the ownership guards shared by the workflows controllers.
 *
 * Sibling concerns split out in #754:
 * - `WorkflowTemplateSeederService` — operator-only catalog backfill helpers
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
    private readonly moduleRef: ModuleRef,
  ) {
    super(prisma, 'workflow', logger);
  }

  /**
   * Fat WorkflowsModule owns executor / catalog / marketplace.
   * Look them up at call time so WorkflowsCore can construct this service
   * without importing those siblings.
   */
  private get workflowExecutorService(): WorkflowExecutorService | undefined {
    try {
      return this.moduleRef.get(WorkflowExecutorService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private get workflowExecutionQueueService():
    | WorkflowExecutionQueueService
    | undefined {
    try {
      return this.moduleRef.get(WorkflowExecutionQueueService, {
        strict: false,
      });
    } catch {
      return undefined;
    }
  }

  private get marketplaceApiClient(): MarketplaceApiClient | undefined {
    try {
      return this.moduleRef.get(MarketplaceApiClient, { strict: false });
    } catch {
      return undefined;
    }
  }

  private get systemWorkflowCatalogService():
    | SystemWorkflowCatalogService
    | undefined {
    try {
      return this.moduleRef.get<SystemWorkflowCatalogService>(
        SYSTEM_WORKFLOW_CATALOG,
        { strict: false },
      );
    } catch {
      return undefined;
    }
  }

  private assertWorkflowMutable(workflow: Pick<WorkflowDocument, 'metadata'>) {
    if (!isProtectedSystemWorkflowMetadata(workflow.metadata)) {
      return;
    }

    throw new ForbiddenException(
      'System workflows are immutable. Duplicate the workflow before editing or deleting it.',
    );
  }

  protected override normalizeDocument(document: unknown): WorkflowDocument {
    const record = super.normalizeDocument(document) as Record<string, unknown>;
    const config =
      record.config !== null &&
      typeof record.config === 'object' &&
      !Array.isArray(record.config)
        ? (record.config as Record<string, unknown>)
        : {};

    const flattened = { ...config, ...record };
    return 'currentVersion' in flattened
      ? hydrateWorkflowDefinition(flattened)
      : (flattened as WorkflowDocument);
  }

  override async findOne(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [],
  ): Promise<WorkflowDocument | null> {
    return super.findOne(params, [...populate, { path: 'currentVersion' }]);
  }

  override async find(
    params: Record<string, unknown>,
    populate: PopulateOption[] = [],
  ): Promise<WorkflowDocument[]> {
    return super.find(params, [...populate, { path: 'currentVersion' }]);
  }

  override async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache: boolean = true,
  ): Promise<AggregatePaginateResult<WorkflowDocument>> {
    const query =
      input !== null && typeof input === 'object' && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    if ('select' in query) {
      return super.findAll(input, options, enableCache);
    }

    const include =
      query.include !== null &&
      typeof query.include === 'object' &&
      !Array.isArray(query.include)
        ? (query.include as Record<string, unknown>)
        : {};
    return super.findAll(
      { ...query, include: { ...include, currentVersion: true } },
      options,
      enableCache,
    );
  }

  override async create(
    createDto: CreateWorkflowDto,
  ): Promise<WorkflowDocument> {
    const { definition, workflow } = splitWorkflowDefinition(
      createDto as unknown as Record<string, unknown>,
    );
    delete workflow.currentVersionId;
    const created = await this.prisma.$transaction((transaction) =>
      createVersionedWorkflow(
        transaction,
        workflow as VersionedWorkflowIdentityInput,
        definition,
      ),
    );

    return this.normalizeDocument(created);
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateWorkflowDto> | Record<string, unknown>,
  ): Promise<WorkflowDocument> {
    const workflowPatch = updateDto as Record<string, unknown>;
    const configPatch = pickDefinedFields(
      workflowPatch,
      WORKFLOW_CONFIG_FIELDS,
    );
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    let config: Record<string, unknown> | undefined;

    if (hasConfigPatch) {
      const existing = await this.findOne({ id });
      if (!existing) {
        throw new NotFoundException('Workflow');
      }
      config = { ...(existing.config ?? {}), ...configPatch };
    }

    const { definition, workflow: scalarPatch } = splitWorkflowDefinition({
      ...workflowPatch,
      ...(config ? { config } : {}),
    });
    for (const field of WORKFLOW_CONFIG_FIELDS) {
      delete scalarPatch[field];
    }
    delete scalarPatch.currentVersionId;

    const hasDefinitionPatch = WORKFLOW_DEFINITION_FIELDS.some(
      (field) => field in workflowPatch,
    );
    if (!hasDefinitionPatch) {
      return super.patch(id, scalarPatch, [{ path: 'currentVersion' }]);
    }

    const existing = await this.findOne({ id });
    if (!existing) {
      throw new NotFoundException('Workflow');
    }
    const nextDefinition = buildWorkflowVersionDefinition({
      edges: definition.edges ?? existing.edges,
      inputVariables: definition.inputVariables ?? existing.inputVariables,
      lockedNodeIds: definition.lockedNodeIds ?? existing.lockedNodeIds,
      nodes: definition.nodes ?? existing.nodes,
    });

    const updated = await this.prisma.$transaction(async (transaction) => {
      const version = await transaction.workflowVersion.create({
        data: {
          contentHash: nextDefinition.contentHash,
          graph: nextDefinition.graph as unknown as Prisma.InputJsonValue,
          inputSchema:
            nextDefinition.inputSchema as unknown as Prisma.InputJsonValue,
          organizationId: existing.organizationId,
          userId: existing.userId,
          version: existing.version + 1,
          workflowId: existing.id,
        },
      });
      const changed = await transaction.workflow.updateMany({
        data: { ...scalarPatch, currentVersionId: version.id },
        where: { currentVersionId: existing.versionId, id },
      });
      if (changed.count !== 1) {
        throw new Error(`Workflow ${id} was edited concurrently`);
      }

      return transaction.workflow.findUniqueOrThrow({
        include: { currentVersion: true },
        where: { id },
      });
    });

    return this.normalizeDocument(updated);
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
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in this organization',
      );
    }
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
      id: id,
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
    // Clone via create body (`sourceWorkflowId`). An explicit body brandId wins
    // over the session brand — the retired POST /:id/clone had the same
    // precedence (`dto.brandId ?? sessionBrand`).
    if (workflowData.sourceWorkflowId) {
      return this.cloneWorkflow(
        workflowData.sourceWorkflowId,
        userId,
        organizationId,
        resolveWorkflowBrandId(
          (workflowData as WorkflowCreateExtras).brandId,
          defaultBrandId,
        ),
      );
    }

    // Catalog install is create-with-template on the workflows collection —
    // not a separate /system-catalog install RPC (#2176).
    const metadataSourceType = workflowData.metadata?.sourceType;
    if (
      workflowData.sourceType === 'system-catalog' ||
      metadataSourceType === 'system-catalog'
    ) {
      const canonicalId = workflowData.templateId;
      if (!canonicalId) {
        throw new BadRequestException(
          'templateId is required when sourceType is system-catalog',
        );
      }
      if (!this.systemWorkflowCatalogService) {
        throw new BadRequestException(
          'System workflow catalog is not available',
        );
      }

      const brandId = resolveWorkflowBrandId(
        (workflowData as WorkflowCreateExtras).brandId,
        defaultBrandId,
      );
      await this.assertWorkflowBrandAccess(brandId, organizationId);

      const installed = await this.systemWorkflowCatalogService.install({
        brandId,
        canonicalId,
        organizationId,
        userId,
      });

      return EntityFactory.fromDocument(WorkflowEntity, installed);
    }

    const templateMetadata = workflowData.templateId
      ? {
          sourceTemplateId: workflowData.templateId,
          sourceType: 'seeded-template',
        }
      : undefined;
    workflowData = this.applyTemplateDefaults(workflowData, templateMetadata);

    const metadata =
      workflowData.metadata || templateMetadata
        ? {
            ...templateMetadata,
            ...(workflowData.metadata ?? {}),
          }
        : undefined;
    const brandId = resolveWorkflowBrandId(
      (workflowData as WorkflowCreateExtras).brandId,
      defaultBrandId,
    );
    await this.assertWorkflowBrandAccess(brandId, organizationId);

    const workflow = await this.create(
      buildWorkflowCreatePayload({
        brandId,
        defaultLabel: `Workflow: ${workflowData.templateId || 'Custom'}`,
        organizationId,
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
    await this.syncWorkflowScheduler(workflow);

    // If trigger is manual, start execution immediately when all required
    // inputs have defaults. Required-input templates must wait for a run form.
    if ((workflowData.trigger as string) === 'manual') {
      const initialInputValues =
        getDefaultInputValuesFromWorkflowData(workflowData);
      const missingRequiredInputs = getMissingRequiredInputKeys(
        workflowData,
        initialInputValues,
      );

      if (missingRequiredInputs.length === 0) {
        this.executeWorkflow(
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
   * When creating from a known template, fills graph/input-schema/schedule
   * fields the caller left empty. Non-template creates pass through unchanged.
   */
  private applyTemplateDefaults(
    workflowData: CreateWorkflowDto,
    templateMetadata: Record<string, unknown> | undefined,
  ): CreateWorkflowDto {
    if (
      !workflowData.templateId ||
      !WORKFLOW_TEMPLATES[workflowData.templateId]
    ) {
      return workflowData;
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
  }

  /**
   * Dispatches a manual execution through the workflow graph engine.
   */
  @HandleErrors('execute workflow', 'workflows')
  async executeWorkflow(
    workflowId: string,
    userId: string,
    organizationId: string,
    inputValues: Record<string, unknown> = {},
    metadata?: Record<string, unknown>,
    trigger: WorkflowExecutionTrigger = WorkflowExecutionTrigger.MANUAL,
  ): Promise<{ executionId?: string; mode: 'node' }> {
    const workflowDoc = await this.findOne({
      id: workflowId,
      organizationId: organizationId,
      userId: userId,
    });

    if (!workflowDoc) {
      throw new NotFoundException('Workflow');
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
      organizationId,
      userId,
    });
    const isProtectedSystemWorkflow = isProtectedSystemWorkflowMetadata(
      workflowDoc.metadata,
    );
    const sourceWorkflowId = workflowDoc.id;
    const sourceLabel = workflowDoc.label ?? 'Workflow';

    const brandId =
      targetBrandId ?? resolveWorkflowBrandId(workflowDoc.brandId);
    await this.assertWorkflowBrandAccess(brandId, organizationId);

    const clonedWorkflow = await this.create(
      buildWorkflowCreatePayload({
        brandId,
        defaultLabel: `${sourceLabel} (Copy)`,
        organizationId,
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
      id: workflowId,
      organizationId: organizationId,
      userId: userId,
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
  ): Promise<Array<{ id: string; count: number }>> {
    const workflows = await this.prisma.workflow.findMany({
      select: { status: true },
      where: scopedWhere(organizationId, { userId }),
    });

    const counts = workflows.reduce<Map<string, number>>((acc, workflow) => {
      const status = String(workflow.status);
      acc.set(status, (acc.get(status) ?? 0) + 1);
      return acc;
    }, new Map());

    return Array.from(counts.entries()).map(([id, count]) => ({
      count,
      id,
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
      id: workflowId,
      organizationId: organizationId,
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
      id: workflowId,
      organizationId: organizationId,
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
      organizationId,
      userId,
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
              workflow.label ||
              'A workflow published from the builder',
            downloadData: {
              edges,
              name: workflow.label,
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
              workflow.label ||
              'Workflow',
            tags: ['community', 'workflow'],
            title: workflow.label || 'Untitled Workflow',
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
      id: workflowId,
      organizationId: organizationId,
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
      id: workflowId,
      organizationId: organizationId,
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
    scope: { organizationId: string; userId?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      id: workflowId,
      organizationId: scope.organizationId,
      ...(scope.userId ? { userId: scope.userId } : {}),
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
    scope: { organizationId: string; userId: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOne({
      id: workflowId,
      organizationId: scope.organizationId,
      OR: [
        { userId: scope.userId },
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
    scope: { organizationId: string; userId?: string },
  ): Promise<WorkflowDocument> {
    const workflow = await this.findOwnedOrThrow(workflowId, scope);
    this.assertWorkflowMutable(workflow);
    return workflow;
  }
}
