import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import {
  type AddTurboProjectItemsDto,
  TURBO_PROJECT_MAX_INPUTS,
} from '@api/collections/turbo-projects/dto/add-turbo-project-items.dto';
import type { CreateTurboProjectDto } from '@api/collections/turbo-projects/dto/create-turbo-project.dto';
import type { GenerateTurboIdeasDto } from '@api/collections/turbo-projects/dto/generate-turbo-ideas.dto';
import type { QuoteTurboProjectDto } from '@api/collections/turbo-projects/dto/quote-turbo-project.dto';
import type { ReviewTurboProjectItemsDto } from '@api/collections/turbo-projects/dto/review-turbo-project-items.dto';
import type { UpdateTurboProjectDto } from '@api/collections/turbo-projects/dto/update-turbo-project.dto';
import type { UpdateTurboProjectItemDto } from '@api/collections/turbo-projects/dto/update-turbo-project-item.dto';
import {
  type TurboProjectWithItems,
  toTurboProject,
  toTurboProjectBase,
} from '@api/collections/turbo-projects/services/turbo-project.mapper';
import { TurboProjectIdeaGenerationService } from '@api/collections/turbo-projects/services/turbo-project-idea-generation.service';
import {
  TurboProjectReconcileService,
  turboProjectRetryKey,
  turboProjectStartKey,
} from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import {
  DEFAULT_IDEA_SETTINGS,
  mergeTurboProjectSettings,
} from '@api/collections/turbo-projects/services/turbo-project-settings.util';
import { countTurboProjectItems } from '@api/collections/turbo-projects/services/turbo-project-status.util';
import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { scopedWhere } from '@api/index';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  IngredientCategory,
  TargetExecutionState,
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '@genfeedai/contracts';
import type {
  ITurboProject,
  ITurboProjectQuote,
  ITurboProjectScope,
} from '@genfeedai/contracts/interfaces';
import type { TurboProject, TurboProjectItem } from '@genfeedai/prisma';
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
  TurboProjectStatus.GENERATING,
  TurboProjectStatus.PARTIAL_FAILURE,
  TurboProjectStatus.REVIEWING,
  TurboProjectStatus.SCHEDULED,
]);
const REVIEWABLE_STATUSES = new Set<string>([
  TurboProjectItemStatus.APPROVED,
  TurboProjectItemStatus.READY,
  TurboProjectItemStatus.REJECTED,
]);

/**
 * Studio Turbo projects (#5463): one persisted surface for idea projects and
 * workflow projects. Generation continues server-side (see
 * `TurboProjectReconcileService`), outputs reach publishing through the
 * shared review inbox, and scheduling uses the shared post scheduling path.
 */
@Injectable()
export class TurboProjectsService {
  private readonly context = TurboProjectsService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly reconcileService: TurboProjectReconcileService,
    private readonly batchWorkflowExecutionService: BatchWorkflowExecutionService,
    private readonly workflowsService: WorkflowsService,
    private readonly turboRunService: TurboRunService,
    private readonly ideaGeneration: TurboProjectIdeaGenerationService,
    private readonly brandsService: BrandsService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  async list(
    scope: ITurboProjectScope,
    query: BaseQueryDto,
  ): Promise<AggregatePaginateResult<ITurboProject>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where = scopedWhere(scope.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
    });
    const readPage = () =>
      Promise.all([
        this.prisma.turboProject.findMany({
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
        this.prisma.turboProject.count({ where }),
      ]);
    let [rows, total] = await readPage();

    // Decisions made in the review inbox change a project's counts; pick them
    // up before listing instead of waiting for the project to be opened.
    const reviewing = rows.filter(
      (row) => row.status === TurboProjectStatus.REVIEWING,
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
        ...toTurboProjectBase(row),
        itemCounts: countTurboProjectItems(row.items),
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
    dto: CreateTurboProjectDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    await this.assertBrand(dto.brandId, scope.organizationId);
    if (dto.kind === TurboProjectKind.IDEAS) {
      await this.assertIdeasEnabled(scope);
    }
    if (dto.workflowId) {
      await this.assertWorkflow(dto.workflowId, scope.organizationId);
    }

    const isIdeas = dto.kind === TurboProjectKind.IDEAS;
    const row = await this.prisma.turboProject.create({
      data: {
        brandId: dto.brandId,
        kind: dto.kind,
        name: dto.name ?? (isIdeas ? 'Idea project' : 'Workflow project'),
        organizationId: scope.organizationId,
        settings: toPrismaJson(isIdeas ? { ideas: DEFAULT_IDEA_SETTINGS } : {}),
        status: TurboProjectStatus.DRAFT,
        step: isIdeas ? TurboProjectStep.IDEAS : TurboProjectStep.INPUTS,
        userId: scope.userId,
        workflowId: dto.workflowId ?? null,
      },
    });

    this.logger.log('Turbo project created', {
      turboProjectId: row.id,
      context: this.context,
      kind: row.kind,
      organizationId: scope.organizationId,
    });
    return toTurboProject({ ...row, items: [] });
  }

  async findOne(id: string, scope: ITurboProjectScope): Promise<ITurboProject> {
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
    dto: UpdateTurboProjectDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.updateLocked(id, dto, scope),
    );
  }

  private async updateLocked(
    id: string,
    dto: UpdateTurboProjectDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    const project = await this.requireProject(id, scope);
    if (dto.workflowId !== undefined) {
      if (project.kind !== TurboProjectKind.WORKFLOW) {
        throw new BadRequestException('Only workflow projects use a workflow');
      }
      this.assertDraft(project);
      await this.assertWorkflow(dto.workflowId, scope.organizationId);
    }

    await this.prisma.turboProject.updateMany({
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
                mergeTurboProjectSettings(project.settings, dto.settings),
              ),
            }),
      },
      where: scopedWhere(scope.organizationId, {
        id,
        ...(dto.workflowId === undefined
          ? {}
          : { status: TurboProjectStatus.DRAFT }),
      }),
    });
    return this.loadProject(id, scope);
  }

  /**
   * Deletion takes the project lock start and retry take, so a project can
   * never be deleted between their generating check and their claim.
   */
  remove(id: string, scope: ITurboProjectScope): Promise<void> {
    return this.reconcileService.runExclusive(id, () =>
      this.removeLocked(id, scope),
    );
  }

  private async removeLocked(
    id: string,
    scope: ITurboProjectScope,
  ): Promise<void> {
    await this.requireProject(id, scope);
    const generating = await this.prisma.turboProjectItem.count({
      where: scopedWhere(scope.organizationId, {
        projectId: id,
        status: TurboProjectItemStatus.GENERATING,
      }),
    });
    if (generating > 0) {
      // Generating items hold credits that settle when their output lands.
      throw new ConflictException(
        'Wait for generation to finish before deleting this project',
      );
    }
    await this.prisma.$transaction([
      this.prisma.turboProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { projectId: id }),
      }),
      this.prisma.turboProject.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { id }),
      }),
    ]);
  }

  async generateIdeas(
    id: string,
    dto: GenerateTurboIdeasDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    await this.assertIdeasEnabled(scope);
    const before = await this.requireProject(id, scope);
    this.assertDraft(before);
    if (before.kind !== TurboProjectKind.IDEAS)
      throw new BadRequestException('Only idea projects generate ideas');
    const project = await this.update(
      id,
      { settings: { ideas: dto }, step: TurboProjectStep.IDEAS },
      scope,
    );
    const ideas = await this.brandsService.generateTurboIdeas(
      project.brandId,
      dto,
      scope.organizationId,
    );
    return this.reconcileService.runExclusive(id, async () => {
      const current = await this.requireProject(id, scope);
      if (current.revision !== project.revision)
        throw new ConflictException(
          'The project changed while ideas were generated. Try again.',
        );
      return this.addItemsLocked(id, { ideas }, scope);
    });
  }

  /**
   * Inputs change under the project lock start also takes, and the draft is
   * rechecked inside it, so an input can never land after the project started.
   */
  addItems(
    id: string,
    dto: AddTurboProjectItemsDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.addItemsLocked(id, dto, scope),
    );
  }

  private async addItemsLocked(
    id: string,
    dto: AddTurboProjectItemsDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    const project = await this.requireProject(id, scope);
    this.assertDraft(project);

    if (project.kind === TurboProjectKind.IDEAS) {
      if (!dto.ideas) {
        throw new BadRequestException('Idea projects take ideas');
      }
      await this.replaceIdeas(project, dto.ideas, scope);
    } else {
      if (!dto.inputs) {
        throw new BadRequestException('Workflow projects take inputs');
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
    dto: UpdateTurboProjectItemDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, () =>
      this.updateItemLocked(id, itemId, dto, scope),
    );
  }

  private async updateItemLocked(
    id: string,
    itemId: string,
    dto: UpdateTurboProjectItemDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    await this.requireProject(id, scope);
    const item = await this.requireItem(id, itemId, scope);
    if (item.scheduledAt) {
      throw new BadRequestException('A scheduled item can no longer change');
    }
    await this.prisma.turboProjectItem.updateMany({
      data: {
        ...(dto.caption === undefined ? {} : { caption: dto.caption }),
      },
      where: scopedWhere(scope.organizationId, { id: itemId, projectId: id }),
    });
    if (dto.caption !== undefined && item.postId) {
      // The review draft is the canonical caption the inbox shows and
      // scheduling publishes; keep it in step with Turbo edits.
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
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProject(id, scope);
      this.assertDraft(project);
      await this.requireItem(id, itemId, scope);
      await this.prisma.turboProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { id: itemId, projectId: id }),
      });
      await this.prisma.turboProject.updateMany({
        data: { revision: { increment: 1 }, updatedAt: new Date() },
        where: scopedWhere(scope.organizationId, { id }),
      });
      return this.loadProject(id, scope);
    });
  }

  /** Price idea generation: a draft's pending ideas, or failed ideas. */
  quote(
    id: string,
    dto: QuoteTurboProjectDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProjectQuote> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProjectWithItems(id, scope);
      if (project.kind !== TurboProjectKind.IDEAS) {
        throw new BadRequestException('Only idea projects are quoted');
      }
      await this.assertIdeasEnabled(scope);
      return this.ideaGeneration.quote(project, dto.itemIds, scope);
    });
  }

  /**
   * Start generation for every queued item. Runs under the project's
   * reconcile lock, and the DRAFT → GENERATING claim commits together with
   * the items it claims, so reconciliation never sees a half-started project
   * and a double submit cannot start two runs. The workflow run is dispatched
   * after the claim, keyed to that claim, so repeating it reuses the run.
   */
  start(
    id: string,
    scope: ITurboProjectScope,
    quoteId?: string,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProjectWithItems(id, scope);
      this.assertDraft(project);
      const pending = project.items.filter(
        (item) => item.status === TurboProjectItemStatus.PENDING,
      );
      if (pending.length === 0) {
        throw new BadRequestException('Add at least one input before starting');
      }
      if (project.kind === TurboProjectKind.IDEAS) {
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
        const claim = await tx.turboProject.updateMany({
          data: {
            status: TurboProjectStatus.GENERATING,
            step: TurboProjectStep.REVIEW,
          },
          where: scopedWhere(scope.organizationId, {
            id,
            status: TurboProjectStatus.DRAFT,
          }),
        });
        if (claim.count !== 1) {
          throw new ConflictException('This project has already started');
        }
        // The run's index is claimed with each item, so reconcile can recover
        // a run whose execution link was never saved from its start key.
        for (const [index, item] of pending.entries()) {
          await tx.turboProjectItem.updateMany({
            data: {
              dispatchedAt,
              status: TurboProjectItemStatus.GENERATING,
              workflowExecutionId: null,
              workflowItemIndex: index,
            },
            where: scopedWhere(scope.organizationId, {
              id: item.id,
              projectId: id,
              status: TurboProjectItemStatus.PENDING,
            }),
          });
        }
      });

      if (project.workflowId) {
        let executionId: string;
        try {
          executionId =
            await this.batchWorkflowExecutionService.startBatchExecution({
              idempotencyKey: turboProjectStartKey(id, dispatchedAt),
              ingredientIds: pending.flatMap((item) =>
                item.inputIngredientId ? [item.inputIngredientId] : [],
              ),
              organizationId: scope.organizationId,
              userId: scope.userId,
              workflowId: project.workflowId,
            });
        } catch (error: unknown) {
          await this.prisma.$transaction(async (tx) => {
            await tx.turboProject.updateMany({
              data: {
                status: TurboProjectStatus.DRAFT,
                step: TurboProjectStep.INPUTS,
              },
              where: scopedWhere(scope.organizationId, { id }),
            });
            await tx.turboProjectItem.updateMany({
              data: {
                dispatchedAt: null,
                status: TurboProjectItemStatus.PENDING,
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
              this.prisma.turboProjectItem.updateMany({
                data: {
                  status: TurboProjectItemStatus.GENERATING,
                  workflowExecutionId: executionId,
                  workflowItemIndex: index,
                },
                where: scopedWhere(scope.organizationId, { id: item.id }),
              }),
            ),
          ),
        );
      }

      this.logger.log('Turbo project started', {
        turboProjectId: id,
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
    scope: ITurboProjectScope,
    quoteId?: string,
  ): Promise<ITurboProject> {
    return this.reconcileService.runExclusive(id, async () => {
      const project = await this.requireProject(id, scope);
      const item = await this.requireItem(id, itemId, scope);
      if (item.status !== TurboProjectItemStatus.FAILED) {
        throw new BadRequestException('Only a failed item can be retried');
      }
      if (project.kind === TurboProjectKind.IDEAS) {
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
        const claim = await transaction.turboProjectItem.updateMany({
          data: {
            dispatchedAt: new Date(),
            error: null,
            outputCategory: null,
            outputIngredientId: null,
            retryCount: attempt,
            status: TurboProjectItemStatus.GENERATING,
            workflowExecutionId: null,
            workflowItemIndex: 0,
          },
          where: scopedWhere(scope.organizationId, {
            id: itemId,
            retryCount: item.retryCount,
            status: TurboProjectItemStatus.FAILED,
          }),
        });
        if (claim.count !== 1) {
          throw new ConflictException('This item is already being retried');
        }

        await transaction.turboProject.updateMany({
          data: { status: TurboProjectStatus.GENERATING },
          where: scopedWhere(scope.organizationId, { id }),
        });
      });

      if (project.workflowId && item.inputIngredientId) {
        let executionId: string;
        try {
          executionId =
            await this.batchWorkflowExecutionService.startBatchExecution({
              idempotencyKey: turboProjectRetryKey(itemId, attempt),
              ingredientIds: [item.inputIngredientId],
              organizationId: scope.organizationId,
              userId: scope.userId,
              workflowId: project.workflowId,
            });
        } catch (error: unknown) {
          await this.prisma.turboProjectItem.updateMany({
            data: {
              error:
                error instanceof Error
                  ? error.message
                  : 'Retry failed to start',
              status: TurboProjectItemStatus.FAILED,
            },
            where: scopedWhere(scope.organizationId, {
              id: itemId,
              retryCount: attempt,
              status: TurboProjectItemStatus.GENERATING,
            }),
          });
          throw error;
        }
        await this.linkStartedRun(id, scope, () =>
          this.prisma.turboProjectItem.updateMany({
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

      this.logger.log('Turbo project item retried', {
        attempt,
        turboProjectId: id,
        turboProjectItemId: itemId,
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
    scope: ITurboProjectScope,
    write: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await write();
    } catch (error: unknown) {
      this.logger.warn(
        'Turbo project run link not saved; reconcile recovers it',
        {
          turboProjectId: id,
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
    dto: ReviewTurboProjectItemsDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
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
    dto: ReviewTurboProjectItemsDto,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    await this.requireProject(id, scope);
    await this.reconcileService.syncReviewDecisions(id, scope.organizationId);
    const items = await this.prisma.turboProjectItem.findMany({
      where: scopedWhere(scope.organizationId, {
        id: { in: dto.itemIds },
        projectId: id,
      }),
    });
    if (items.length !== new Set(dto.itemIds).size) {
      throw new NotFoundException('Turbo project item');
    }

    if (
      dto.decision === 'approved' &&
      items.some((item) => item.status === TurboProjectItemStatus.REJECTED)
    ) {
      // The inbox deletes a rejected item's draft; approving cannot bring it back.
      throw new ConflictException(
        'A rejected item cannot be approved. Retry or regenerate it instead.',
      );
    }

    const reviewItemIdsByTurboRun = new Map<string, string[]>();
    for (const item of items) {
      if (
        !REVIEWABLE_STATUSES.has(item.status) ||
        item.scheduledAt ||
        !item.reviewTurboRunId ||
        !item.reviewItemId
      ) {
        throw new BadRequestException(
          'Only generated, unscheduled items can be reviewed',
        );
      }
      const group = reviewItemIdsByTurboRun.get(item.reviewTurboRunId) ?? [];
      group.push(item.reviewItemId);
      reviewItemIdsByTurboRun.set(item.reviewTurboRunId, group);
    }

    for (const [reviewTurboRunId, reviewItemIds] of reviewItemIdsByTurboRun) {
      if (dto.decision === 'approved') {
        await this.turboRunService.approveItems(
          reviewTurboRunId,
          reviewItemIds,
          scope.organizationId,
          scope.userId,
        );
      } else {
        await this.turboRunService.rejectItems(
          reviewTurboRunId,
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
    project: TurboProject,
    ideas: NonNullable<AddTurboProjectItemsDto['ideas']>,
    scope: ITurboProjectScope,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.turboProjectItem.updateMany({
        data: { isDeleted: true },
        where: scopedWhere(scope.organizationId, { projectId: project.id }),
      }),
      this.prisma.turboProjectItem.createMany({
        data: ideas.map((idea, position) => ({
          caption: idea.caption,
          idea: toPrismaJson(idea),
          organizationId: scope.organizationId,
          position,
          projectId: project.id,
          status: TurboProjectItemStatus.PENDING,
        })),
      }),
      this.prisma.turboProject.updateMany({
        data: { revision: { increment: 1 }, updatedAt: new Date() },
        where: scopedWhere(scope.organizationId, { id: project.id }),
      }),
    ]);
  }

  private async appendInputs(
    project: TurboProject,
    ingredientIds: string[],
    scope: ITurboProjectScope,
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
        'Workflow projects accept images and videos',
      );
    }

    const existing = await this.prisma.turboProjectItem.findMany({
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
    if (existing.length + added.length > TURBO_PROJECT_MAX_INPUTS) {
      throw new BadRequestException(
        `A workflow project accepts at most ${TURBO_PROJECT_MAX_INPUTS} inputs`,
      );
    }
    const nextPosition = (existing[0]?.position ?? -1) + 1;

    await this.prisma.$transaction([
      this.prisma.turboProjectItem.createMany({
        data: added.map((ingredientId, offset) => ({
          inputCategory: categoryById.get(ingredientId) ?? null,
          inputIngredientId: ingredientId,
          organizationId: scope.organizationId,
          position: nextPosition + offset,
          projectId: project.id,
          status: TurboProjectItemStatus.PENDING,
        })),
      }),
      this.prisma.turboProject.updateMany({
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

  /** Idea projects are gated by the central `turbo_ideas` Admin platform flag (#5463). */
  private async assertIdeasEnabled(scope: ITurboProjectScope): Promise<void> {
    if (scope.isSuperAdmin) {
      return;
    }
    const { flags } = await this.platformSettingsService.getFeatureSettings();
    if (!flags.turbo_ideas) {
      throw new NotFoundException({ message: 'Idea projects are not enabled' });
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

  private assertDraft(project: TurboProject): void {
    if (project.status !== TurboProjectStatus.DRAFT) {
      throw new BadRequestException(
        'Inputs can only change before the project starts',
      );
    }
  }

  private touchProject(id: string, scope: ITurboProjectScope) {
    return this.prisma.turboProject.updateMany({
      data: { updatedAt: new Date() },
      where: scopedWhere(scope.organizationId, { id }),
    });
  }

  private async requireProject(
    id: string,
    scope: ITurboProjectScope,
  ): Promise<TurboProject> {
    const project = await this.prisma.turboProject.findFirst({
      where: scopedWhere(scope.organizationId, { id }),
    });
    if (!project) {
      throw new NotFoundException('Turbo project', id);
    }
    return project;
  }

  private async requireProjectWithItems(
    id: string,
    scope: ITurboProjectScope,
  ): Promise<TurboProjectWithItems> {
    const project = await this.prisma.turboProject.findFirst({
      include: {
        items: {
          orderBy: { position: 'asc' },
          where: { isDeleted: false, organizationId: scope.organizationId },
        },
      },
      where: scopedWhere(scope.organizationId, { id }),
    });
    if (!project) {
      throw new NotFoundException('Turbo project', id);
    }
    return project;
  }

  private async requireItem(
    projectId: string,
    itemId: string,
    scope: ITurboProjectScope,
  ): Promise<TurboProjectItem> {
    const item = await this.prisma.turboProjectItem.findFirst({
      where: scopedWhere(scope.organizationId, { id: itemId, projectId }),
    });
    if (!item) {
      throw new NotFoundException('Turbo project item', itemId);
    }
    return item;
  }

  private async loadProject(
    id: string,
    scope: ITurboProjectScope,
  ): Promise<ITurboProject> {
    return toTurboProject(await this.requireProjectWithItems(id, scope));
  }
}
