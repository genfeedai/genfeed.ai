import {
  type AddBatchProjectItemsDto,
  BATCH_PROJECT_MAX_INPUTS,
} from '@api/collections/batch-projects/dto/add-batch-project-items.dto';
import type { CreateBatchProjectDto } from '@api/collections/batch-projects/dto/create-batch-project.dto';
import type { GenerateBatchIdeasDto } from '@api/collections/batch-projects/dto/generate-batch-ideas.dto';
import type { QuoteBatchProjectDto } from '@api/collections/batch-projects/dto/quote-batch-project.dto';
import type { ReviewBatchProjectItemsDto } from '@api/collections/batch-projects/dto/review-batch-project-items.dto';
import type { UpdateBatchProjectDto } from '@api/collections/batch-projects/dto/update-batch-project.dto';
import type { UpdateBatchProjectItemDto } from '@api/collections/batch-projects/dto/update-batch-project-item.dto';
import {
  type BatchProjectWithItems,
  toBatchProject,
  toBatchProjectBase,
} from '@api/collections/batch-projects/services/batch-project.mapper';
import { BatchProjectIdeaGenerationService } from '@api/collections/batch-projects/services/batch-project-idea-generation.service';
import {
  BatchProjectReconcileService,
  batchProjectRetryKey,
  batchProjectStartKey,
} from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import {
  DEFAULT_IDEA_SETTINGS,
  mergeBatchProjectSettings,
} from '@api/collections/batch-projects/services/batch-project-settings.util';
import { countBatchProjectItems } from '@api/collections/batch-projects/services/batch-project-status.util';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { scopedWhere } from '@api/index';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
  IngredientCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBatchProject,
  IBatchProjectQuote,
  IBatchProjectScope,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const INPUT_CATEGORIES = new Set<string>([
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
]);
const RECONCILED_STATUSES = new Set<string>([
  BatchProjectStatus.GENERATING,
  BatchProjectStatus.PARTIAL_FAILURE,
  BatchProjectStatus.REVIEWING,
  BatchProjectStatus.SCHEDULED,
]);
const REVIEWABLE_STATUSES = new Set<string>([
  BatchProjectItemStatus.APPROVED,
  BatchProjectItemStatus.READY,
  BatchProjectItemStatus.REJECTED,
]);

/**
 * Studio Batch projects (#5463): one persisted surface for idea batches and
 * workflow batches. Generation continues server-side (see
 * `BatchProjectReconcileService`), outputs reach publishing through the
 * shared review inbox, and scheduling uses the shared post scheduling path.
 */
@Injectable()
export class BatchProjectsService {
  private readonly context = BatchProjectsService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly reconcileService: BatchProjectReconcileService,
    private readonly batchWorkflowExecutionService: BatchWorkflowExecutionService,
    private readonly workflowsService: WorkflowsService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly ideaGeneration: BatchProjectIdeaGenerationService,
    private readonly brandsService: BrandsService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  async list(
    scope: IBatchProjectScope,
    query: BaseQueryDto,
  ): Promise<AggregatePaginateResult<IBatchProject>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where = scopedWhere(scope.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
    });
    const readPage = () =>
      Promise.all([
        this.prisma.batchProject.findMany({
          include: {
            items: {
              select: { scheduledAt: true, status: true },
              where: { isDeleted: false, organizationId: scope.organizationId },
            },
          },
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          where,
        }),
        this.prisma.batchProject.count({ where }),
      ]);
    let [rows, total] = await readPage();

    // Decisions made in the review inbox change a project's counts; pick them
    // up before listing instead of waiting for the project to be opened.
    const reviewing = rows.filter(
      (row) => row.status === BatchProjectStatus.REVIEWING,
    );
    if (reviewing.length > 0) {
      for (const row of reviewing) {
        await this.reconcileService.syncReviewState(
          row.id,
          scope.organizationId,
        );
      }
      [rows, total] = await readPage();
    }

    const hasNextPage = page * limit < total;
    return {
      docs: rows.map((row) => ({
        ...toBatchProjectBase(row),
        itemCounts: countBatchProjectItems(row.items),
      })),
      hasNextPage,
      hasPrevPage: page > 1,
      limit,
      nextPage: hasNextPage ? page + 1 : null,
      page,
      pagingCounter: (page - 1) * limit + 1,
      prevPage: page > 1 ? page - 1 : null,
      totalDocs: total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(
    dto: CreateBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.assertBrand(dto.brandId, scope.organizationId);
    if (dto.kind === BatchProjectKind.IDEAS) {
      await this.assertIdeasEnabled(scope);
    }
    if (dto.workflowId) {
      await this.assertWorkflow(dto.workflowId, scope.organizationId);
    }

    const isIdeas = dto.kind === BatchProjectKind.IDEAS;
    const row = await this.prisma.batchProject.create({
      data: {
        brandId: dto.brandId,
        kind: dto.kind,
        name: dto.name ?? (isIdeas ? 'Idea batch' : 'Workflow batch'),
        organizationId: scope.organizationId,
        settings: toPrismaJson(isIdeas ? { ideas: DEFAULT_IDEA_SETTINGS } : {}),
        status: BatchProjectStatus.DRAFT,
        step: isIdeas ? BatchProjectStep.IDEAS : BatchProjectStep.INPUTS,
        userId: scope.userId,
        workflowId: dto.workflowId ?? null,
      },
    });

    this.logger.log('Batch project created', {
      batchProjectId: row.id,
      context: this.context,
      kind: row.kind,
      organizationId: scope.organizationId,
    });
    return toBatchProject({ ...row, items: [] });
  }

  async findOne(id: string, scope: IBatchProjectScope): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    if (RECONCILED_STATUSES.has(project.status)) {
      await this.reconcileService.reconcileProject(id, scope.organizationId);
    }
    return this.loadProject(id, scope);
  }

  /**
   * Updates take the project lock start takes, and a workflow change is
   * rechecked as a draft inside it, so a started run and its retries always
   * use the workflow the run started with.
   */
  update(
    id: string,
    dto: UpdateBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.updateLocked(id, dto, scope),
    );
  }

  private async updateLocked(
    id: string,
    dto: UpdateBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    if (dto.workflowId !== undefined) {
      if (project.kind !== BatchProjectKind.WORKFLOW) {
        throw new BadRequestException('Only workflow batches use a workflow');
      }
      this.assertDraft(project);
      await this.assertWorkflow(dto.workflowId, scope.organizationId);
    }

    await this.prisma.batchProject.updateMany({
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.step === undefined ? {} : { step: dto.step }),
        ...(dto.workflowId === undefined
          ? {}
          : { revision: { increment: 1 }, workflowId: dto.workflowId }),
        ...(dto.settings === undefined
          ? {}
          : {
              settings: toPrismaJson(
                mergeBatchProjectSettings(project.settings, dto.settings),
              ),
            }),
      },
      where: scopedWhere(scope.organizationId, {
        id,
        ...(dto.workflowId === undefined
          ? {}
          : { status: BatchProjectStatus.DRAFT }),
      }),
    });
    return this.loadProject(id, scope);
  }

  /**
   * Deletion takes the project lock start and retry take, so a batch can
   * never be deleted between their generating check and their claim.
   */
  remove(id: string, scope: IBatchProjectScope): Promise<void> {
    return this.reconcileService.runExclusive(id, () =>
      this.removeLocked(id, scope),
    );
  }

  private async removeLocked(
    id: string,
    scope: IBatchProjectScope,
  ): Promise<void> {
    await this.requireProject(id, scope);
    const generating = await this.prisma.batchProjectItem.count({
      where: scopedWhere(scope.organizationId, {
        projectId: id,
        status: BatchProjectItemStatus.GENERATING,
      }),
    });
    if (generating > 0) {
      // Generating items hold credits that settle when their output lands.
      throw new ConflictException(
        'Wait for generation to finish before deleting this batch',
      );
    }
    await this.prisma.$transaction([
      this.prisma.batchProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { projectId: id }),
      }),
      this.prisma.batchProject.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { id }),
      }),
    ]);
  }

  async generateIdeas(
    id: string,
    dto: GenerateBatchIdeasDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.assertIdeasEnabled(scope);
    const before = await this.requireProject(id, scope);
    this.assertDraft(before);
    if (before.kind !== BatchProjectKind.IDEAS)
      throw new BadRequestException('Only idea batches generate ideas');
    const project = await this.update(
      id,
      { settings: { ideas: dto }, step: BatchProjectStep.IDEAS },
      scope,
    );
    const ideas = await this.brandsService.generateBatchIdeas(
      project.brandId,
      dto,
      scope.organizationId,
    );
    return this.reconcileService.runExclusive(id, async () => {
      const current = await this.requireProject(id, scope);
      if (current.revision !== project.revision)
        throw new ConflictException(
          'The batch changed while ideas were generated. Try again.',
        );
      return this.addItemsLocked(id, { ideas }, scope);
    });
  }

  /**
   * Inputs change under the project lock start also takes, and the draft is
   * rechecked inside it, so an input can never land after the batch started.
   */
  addItems(
    id: string,
    dto: AddBatchProjectItemsDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.addItemsLocked(id, dto, scope),
    );
  }

  private async addItemsLocked(
    id: string,
    dto: AddBatchProjectItemsDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    this.assertDraft(project);

    if (project.kind === BatchProjectKind.IDEAS) {
      if (!dto.ideas) {
        throw new BadRequestException('Idea batches take ideas');
      }
      await this.replaceIdeas(project, dto.ideas, scope);
    } else {
      if (!dto.inputs) {
        throw new BadRequestException('Workflow batches take inputs');
      }
      await this.appendInputs(
        project,
        dto.inputs.map((input) => input.ingredientId),
        scope,
      );
    }
    return this.loadProject(id, scope);
  }

  /**
   * Item edits take the project lock scheduling takes, so a caption can
   * never change between scheduling reading it and publishing it.
   */
  updateItem(
    id: string,
    itemId: string,
    dto: UpdateBatchProjectItemDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.updateItemLocked(id, itemId, dto, scope),
    );
  }

  private async updateItemLocked(
    id: string,
    itemId: string,
    dto: UpdateBatchProjectItemDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.requireProject(id, scope);
    const item = await this.requireItem(id, itemId, scope);
    if (item.scheduledAt) {
      throw new BadRequestException('A scheduled item can no longer change');
    }
    await this.prisma.batchProjectItem.updateMany({
      data: {
        ...(dto.caption === undefined ? {} : { caption: dto.caption }),
      },
      where: scopedWhere(scope.organizationId, { id: itemId, projectId: id }),
    });
    if (dto.caption !== undefined && item.postId) {
      // The review draft is the canonical caption the inbox shows and
      // scheduling publishes; keep it in step with Batch edits.
      await this.prisma.post.updateMany({
        data: { description: dto.caption },
        where: scopedWhere(scope.organizationId, {
          id: item.postId,
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      });
    }
    await this.touchProject(id, scope);
    return this.loadProject(id, scope);
  }

  removeItem(
    id: string,
    itemId: string,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProject(id, scope);
      this.assertDraft(project);
      await this.requireItem(id, itemId, scope);
      await this.prisma.batchProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { id: itemId, projectId: id }),
      });
      await this.prisma.batchProject.updateMany({
        data: { revision: { increment: 1 }, updatedAt: new Date() },
        where: scopedWhere(scope.organizationId, { id }),
      });
      return this.loadProject(id, scope);
    });
  }

  /** Price idea generation: a draft's pending ideas, or failed ideas. */
  quote(
    id: string,
    dto: QuoteBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProjectQuote> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProjectWithItems(id, scope);
      if (project.kind !== BatchProjectKind.IDEAS) {
        throw new BadRequestException('Only idea batches are quoted');
      }
      await this.assertIdeasEnabled(scope);
      return this.ideaGeneration.quote(project, dto.itemIds, scope);
    });
  }

  /**
   * Start generation for every queued item. Runs under the project's
   * reconcile lock, and the DRAFT → GENERATING claim commits together with
   * the items it claims, so reconciliation never sees a half-started batch
   * and a double submit cannot start two runs. The workflow run is dispatched
   * after the claim, keyed to that claim, so repeating it reuses the run.
   */
  start(
    id: string,
    scope: IBatchProjectScope,
    quoteId?: string,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProjectWithItems(id, scope);
      this.assertDraft(project);
      const pending = project.items.filter(
        (item) => item.status === BatchProjectItemStatus.PENDING,
      );
      if (pending.length === 0) {
        throw new BadRequestException('Add at least one input before starting');
      }
      if (project.kind === BatchProjectKind.IDEAS) {
        await this.assertIdeasEnabled(scope);
        await this.ideaGeneration.start(project, pending, quoteId, scope);
        return this.loadProject(id, scope);
      }
      if (!project.workflowId) {
        throw new BadRequestException('Choose a workflow before starting');
      }

      const pendingIds = pending.map((item) => item.id);
      const dispatchedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.batchProject.updateMany({
          data: {
            status: BatchProjectStatus.GENERATING,
            step: BatchProjectStep.REVIEW,
          },
          where: scopedWhere(scope.organizationId, {
            id,
            status: BatchProjectStatus.DRAFT,
          }),
        });
        if (claim.count !== 1) {
          throw new ConflictException('This batch has already started');
        }
        // The run's index is claimed with each item, so reconcile can recover
        // a run whose execution link was never saved from its start key.
        for (const [index, item] of pending.entries()) {
          await tx.batchProjectItem.updateMany({
            data: {
              dispatchedAt,
              status: BatchProjectItemStatus.GENERATING,
              workflowExecutionId: null,
              workflowItemIndex: index,
            },
            where: scopedWhere(scope.organizationId, {
              id: item.id,
              projectId: id,
              status: BatchProjectItemStatus.PENDING,
            }),
          });
        }
      });

      if (project.workflowId) {
        let executionId: string;
        try {
          executionId =
            await this.batchWorkflowExecutionService.startBatchExecution({
              idempotencyKey: batchProjectStartKey(id, dispatchedAt),
              ingredientIds: pending.flatMap((item) =>
                item.inputIngredientId ? [item.inputIngredientId] : [],
              ),
              organizationId: scope.organizationId,
              userId: scope.userId,
              workflowId: project.workflowId,
            });
        } catch (error: unknown) {
          await this.prisma.$transaction(async (tx) => {
            await tx.batchProject.updateMany({
              data: {
                status: BatchProjectStatus.DRAFT,
                step: BatchProjectStep.INPUTS,
              },
              where: scopedWhere(scope.organizationId, { id }),
            });
            await tx.batchProjectItem.updateMany({
              data: {
                dispatchedAt: null,
                status: BatchProjectItemStatus.PENDING,
              },
              where: scopedWhere(scope.organizationId, {
                id: { in: pendingIds },
                projectId: id,
              }),
            });
          });
          throw error;
        }
        await this.linkStartedRun(id, scope, () =>
          this.prisma.$transaction(
            pending.map((item, index) =>
              this.prisma.batchProjectItem.updateMany({
                data: {
                  status: BatchProjectItemStatus.GENERATING,
                  workflowExecutionId: executionId,
                  workflowItemIndex: index,
                },
                where: scopedWhere(scope.organizationId, { id: item.id }),
              }),
            ),
          ),
        );
      }

      this.logger.log('Batch project started', {
        batchProjectId: id,
        context: this.context,
        itemCount: pending.length,
        kind: project.kind,
        organizationId: scope.organizationId,
      });
      return this.loadProject(id, scope);
    });
  }

  /**
   * Rerun one failed item without touching the others. The item is claimed
   * (FAILED → GENERATING, next attempt number) before anything is dispatched,
   * and the workflow run is keyed to that attempt, so concurrent retries
   * cannot start or bill two runs.
   */
  retryItem(
    id: string,
    itemId: string,
    scope: IBatchProjectScope,
    quoteId?: string,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProject(id, scope);
      const item = await this.requireItem(id, itemId, scope);
      if (item.status !== BatchProjectItemStatus.FAILED) {
        throw new BadRequestException('Only a failed item can be retried');
      }
      if (project.kind === BatchProjectKind.IDEAS) {
        await this.assertIdeasEnabled(scope);
        await this.ideaGeneration.retry(project, item, quoteId, scope);
        await this.reconcileService.refreshProjectStatus(
          id,
          scope.organizationId,
        );
        return this.loadProject(id, scope);
      }
      if (!project.workflowId || !item.inputIngredientId) {
        throw new BadRequestException('This item has no workflow input');
      }

      const attempt = item.retryCount + 1;
      await this.prisma.$transaction(async (transaction) => {
        const claim = await transaction.batchProjectItem.updateMany({
          data: {
            dispatchedAt: new Date(),
            error: null,
            outputCategory: null,
            outputIngredientId: null,
            retryCount: attempt,
            status: BatchProjectItemStatus.GENERATING,
            workflowExecutionId: null,
            workflowItemIndex: 0,
          },
          where: scopedWhere(scope.organizationId, {
            id: itemId,
            retryCount: item.retryCount,
            status: BatchProjectItemStatus.FAILED,
          }),
        });
        if (claim.count !== 1) {
          throw new ConflictException('This item is already being retried');
        }

        await transaction.batchProject.updateMany({
          data: { status: BatchProjectStatus.GENERATING },
          where: scopedWhere(scope.organizationId, { id }),
        });
      });

      if (project.workflowId && item.inputIngredientId) {
        let executionId: string;
        try {
          executionId =
            await this.batchWorkflowExecutionService.startBatchExecution({
              idempotencyKey: batchProjectRetryKey(itemId, attempt),
              ingredientIds: [item.inputIngredientId],
              organizationId: scope.organizationId,
              userId: scope.userId,
              workflowId: project.workflowId,
            });
        } catch (error: unknown) {
          await this.prisma.batchProjectItem.updateMany({
            data: {
              error:
                error instanceof Error
                  ? error.message
                  : 'Retry failed to start',
              status: BatchProjectItemStatus.FAILED,
            },
            where: scopedWhere(scope.organizationId, {
              id: itemId,
              retryCount: attempt,
              status: BatchProjectItemStatus.GENERATING,
            }),
          });
          throw error;
        }
        await this.linkStartedRun(id, scope, () =>
          this.prisma.batchProjectItem.updateMany({
            data: { workflowExecutionId: executionId, workflowItemIndex: 0 },
            where: scopedWhere(scope.organizationId, {
              id: itemId,
              retryCount: attempt,
            }),
          }),
        );
      }
      await this.reconcileService.refreshProjectStatus(
        id,
        scope.organizationId,
      );

      this.logger.log('Batch project item retried', {
        attempt,
        batchProjectId: id,
        batchProjectItemId: itemId,
        context: this.context,
        organizationId: scope.organizationId,
      });
      return this.loadProject(id, scope);
    });
  }

  /**
   * Save the link to a run that already started. The run is paid for, so a
   * failed write must not fail the item: reconcile recovers the link from the
   * attempt's idempotency key.
   */
  private async linkStartedRun(
    id: string,
    scope: IBatchProjectScope,
    write: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await write();
    } catch (error: unknown) {
      this.logger.warn(
        'Batch project run link not saved; reconcile recovers it',
        {
          batchProjectId: id,
          context: this.context,
          error: error instanceof Error ? error.message : String(error),
          organizationId: scope.organizationId,
        },
      );
    }
  }

  /**
   * Approve or reject through the review inbox itself, so the decision is the
   * one the inbox shows; project items then mirror the recorded decision.
   */
  review(
    id: string,
    dto: ReviewBatchProjectItemsDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.reviewLocked(id, dto, scope),
    );
  }

  /**
   * Under the project lock, inbox decisions are mirrored first, so the
   * checks below read the canonical review decision, not a stale copy.
   */
  private async reviewLocked(
    id: string,
    dto: ReviewBatchProjectItemsDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.requireProject(id, scope);
    await this.reconcileService.syncReviewDecisions(id, scope.organizationId);
    const items = await this.prisma.batchProjectItem.findMany({
      where: scopedWhere(scope.organizationId, {
        id: { in: dto.itemIds },
        projectId: id,
      }),
    });
    if (items.length !== new Set(dto.itemIds).size) {
      throw new NotFoundException('Batch project item');
    }

    if (
      dto.decision === 'approved' &&
      items.some((item) => item.status === BatchProjectItemStatus.REJECTED)
    ) {
      // The inbox deletes a rejected item's draft; approving cannot bring it back.
      throw new ConflictException(
        'A rejected item cannot be approved. Retry or regenerate it instead.',
      );
    }

    const reviewItemIdsByBatch = new Map<string, string[]>();
    for (const item of items) {
      if (
        !REVIEWABLE_STATUSES.has(item.status) ||
        item.scheduledAt ||
        !item.reviewBatchId ||
        !item.reviewItemId
      ) {
        throw new BadRequestException(
          'Only generated, unscheduled items can be reviewed',
        );
      }
      const group = reviewItemIdsByBatch.get(item.reviewBatchId) ?? [];
      group.push(item.reviewItemId);
      reviewItemIdsByBatch.set(item.reviewBatchId, group);
    }

    for (const [reviewBatchId, reviewItemIds] of reviewItemIdsByBatch) {
      if (dto.decision === 'approved') {
        await this.batchGenerationService.approveItems(
          reviewBatchId,
          reviewItemIds,
          scope.organizationId,
          scope.userId,
        );
      } else {
        await this.batchGenerationService.rejectItems(
          reviewBatchId,
          reviewItemIds,
          scope.organizationId,
          undefined,
          scope.userId,
        );
      }
    }

    await this.reconcileService.syncReviewDecisions(id, scope.organizationId);
    await this.reconcileService.refreshProjectStatus(id, scope.organizationId);
    return this.loadProject(id, scope);
  }

  private async replaceIdeas(
    project: BatchProject,
    ideas: NonNullable<AddBatchProjectItemsDto['ideas']>,
    scope: IBatchProjectScope,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.batchProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { projectId: project.id }),
      }),
      this.prisma.batchProjectItem.createMany({
        data: ideas.map((idea, position) => ({
          caption: idea.caption,
          idea: toPrismaJson(idea),
          organizationId: scope.organizationId,
          position,
          projectId: project.id,
          status: BatchProjectItemStatus.PENDING,
        })),
      }),
      this.prisma.batchProject.updateMany({
        data: { revision: { increment: 1 }, updatedAt: new Date() },
        where: scopedWhere(scope.organizationId, { id: project.id }),
      }),
    ]);
  }

  private async appendInputs(
    project: BatchProject,
    ingredientIds: string[],
    scope: IBatchProjectScope,
  ): Promise<void> {
    const requested = [...new Set(ingredientIds)];
    const ingredients = await this.prisma.ingredient.findMany({
      select: { category: true, id: true },
      where: scopedWhere(scope.organizationId, { id: { in: requested } }),
    });
    if (ingredients.length !== requested.length) {
      throw new BadRequestException(
        'One or more inputs do not belong to this organization',
      );
    }
    if (
      ingredients.some(
        (ingredient) => !INPUT_CATEGORIES.has(ingredient.category),
      )
    ) {
      throw new BadRequestException(
        'Workflow batches accept images and videos',
      );
    }

    const existing = await this.prisma.batchProjectItem.findMany({
      orderBy: { position: 'desc' },
      select: { inputIngredientId: true, position: true },
      where: scopedWhere(scope.organizationId, { projectId: project.id }),
    });
    const existingIds = new Set(
      existing.flatMap((item) =>
        item.inputIngredientId ? [item.inputIngredientId] : [],
      ),
    );
    const categoryById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient.category]),
    );
    const added = requested.filter(
      (ingredientId) => !existingIds.has(ingredientId),
    );
    if (existing.length + added.length > BATCH_PROJECT_MAX_INPUTS) {
      throw new BadRequestException(
        `A workflow batch accepts at most ${BATCH_PROJECT_MAX_INPUTS} inputs`,
      );
    }
    const nextPosition = (existing[0]?.position ?? -1) + 1;

    await this.prisma.$transaction([
      this.prisma.batchProjectItem.createMany({
        data: added.map((ingredientId, offset) => ({
          inputCategory: categoryById.get(ingredientId) ?? null,
          inputIngredientId: ingredientId,
          organizationId: scope.organizationId,
          position: nextPosition + offset,
          projectId: project.id,
          status: BatchProjectItemStatus.PENDING,
        })),
      }),
      this.prisma.batchProject.updateMany({
        data: { revision: { increment: 1 }, updatedAt: new Date() },
        where: scopedWhere(scope.organizationId, { id: project.id }),
      }),
    ]);
  }

  private async assertBrand(
    brandId: string,
    organizationId: string,
  ): Promise<void> {
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: brandId }),
    });
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
  }

  /** Idea batches are gated by the central `batch_ideas` Admin platform flag (#5463). */
  private async assertIdeasEnabled(scope: IBatchProjectScope): Promise<void> {
    if (scope.isSuperAdmin) {
      return;
    }
    const { flags } = await this.platformSettingsService.getFeatureSettings();
    if (!flags.batch_ideas) {
      throw new NotFoundException({ message: 'Idea batches are not enabled' });
    }
  }

  private async assertWorkflow(
    workflowId: string,
    organizationId: string,
  ): Promise<void> {
    await this.workflowsService.findOwnedOrThrow(workflowId, {
      organizationId,
    });
  }

  private assertDraft(project: BatchProject): void {
    if (project.status !== BatchProjectStatus.DRAFT) {
      throw new BadRequestException(
        'Inputs can only change before the batch starts',
      );
    }
  }

  private touchProject(id: string, scope: IBatchProjectScope) {
    return this.prisma.batchProject.updateMany({
      data: { updatedAt: new Date() },
      where: scopedWhere(scope.organizationId, { id }),
    });
  }

  private async requireProject(
    id: string,
    scope: IBatchProjectScope,
  ): Promise<BatchProject> {
    const project = await this.prisma.batchProject.findFirst({
      where: scopedWhere(scope.organizationId, { id }),
    });
    if (!project) {
      throw new NotFoundException('Batch project', id);
    }
    return project;
  }

  private async requireProjectWithItems(
    id: string,
    scope: IBatchProjectScope,
  ): Promise<BatchProjectWithItems> {
    const project = await this.prisma.batchProject.findFirst({
      include: {
        items: {
          orderBy: { position: 'asc' },
          where: { isDeleted: false, organizationId: scope.organizationId },
        },
      },
      where: scopedWhere(scope.organizationId, { id }),
    });
    if (!project) {
      throw new NotFoundException('Batch project', id);
    }
    return project;
  }

  private async requireItem(
    projectId: string,
    itemId: string,
    scope: IBatchProjectScope,
  ): Promise<BatchProjectItem> {
    const item = await this.prisma.batchProjectItem.findFirst({
      where: scopedWhere(scope.organizationId, { id: itemId, projectId }),
    });
    if (!item) {
      throw new NotFoundException('Batch project item', itemId);
    }
    return item;
  }

  private async loadProject(
    id: string,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    return toBatchProject(await this.requireProjectWithItems(id, scope));
  }
}
