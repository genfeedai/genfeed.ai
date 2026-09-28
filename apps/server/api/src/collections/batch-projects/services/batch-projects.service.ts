import {
  type AddBatchProjectItemsDto,
  BATCH_PROJECT_MAX_INPUTS,
} from '@api/collections/batch-projects/dto/add-batch-project-items.dto';
import type { CreateBatchProjectDto } from '@api/collections/batch-projects/dto/create-batch-project.dto';
import type { DispatchBatchProjectItemDto } from '@api/collections/batch-projects/dto/dispatch-batch-project-item.dto';
import type { ReviewBatchProjectItemsDto } from '@api/collections/batch-projects/dto/review-batch-project-items.dto';
import type { ScheduleBatchProjectDto } from '@api/collections/batch-projects/dto/schedule-batch-project.dto';
import type { UpdateBatchProjectDto } from '@api/collections/batch-projects/dto/update-batch-project.dto';
import type { UpdateBatchProjectItemDto } from '@api/collections/batch-projects/dto/update-batch-project-item.dto';
import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import {
  BatchProjectReconcileService,
  batchProjectItemSourceKey,
} from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import {
  DEFAULT_IDEA_SETTINGS,
  mergeBatchProjectSettings,
  parseBatchProjectSettings,
} from '@api/collections/batch-projects/services/batch-project-settings.util';
import { countBatchProjectItems } from '@api/collections/batch-projects/services/batch-project-status.util';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { scopedWhere } from '@api/index';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
  fromPrismaCredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBatchProject,
  IBatchProjectItem,
  IBatchProjectScope,
  IScheduleBatchProjectResult,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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

type ProjectWithItems = BatchProject & { items: BatchProjectItem[] };

function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

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
    private readonly postsService: PostsService,
  ) {}

  async list(scope: IBatchProjectScope, query: BaseQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const where = scopedWhere(scope.organizationId, {
      ...(query.brandId ? { brandId: query.brandId } : {}),
    });
    const [rows, total] = await Promise.all([
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

    return {
      docs: rows.map((row) => ({
        ...this.toProjectBase(row),
        itemCounts: countBatchProjectItems(row.items),
      })),
      limit,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    };
  }

  async create(
    dto: CreateBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.assertBrand(dto.brandId, scope.organizationId);
    if (dto.kind === BatchProjectKind.IDEAS) {
      await this.assertIdeasEnabled(scope.organizationId);
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
    return this.toProject({ ...row, items: [] });
  }

  async findOne(id: string, scope: IBatchProjectScope): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    if (RECONCILED_STATUSES.has(project.status)) {
      await this.reconcileService.reconcileProject(id, scope.organizationId);
    }
    return this.loadProject(id, scope);
  }

  async update(
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
        ...(dto.workflowId === undefined ? {} : { workflowId: dto.workflowId }),
        ...(dto.settings === undefined
          ? {}
          : {
              settings: toPrismaJson(
                mergeBatchProjectSettings(project.settings, dto.settings),
              ),
            }),
      },
      where: scopedWhere(scope.organizationId, { id }),
    });
    return this.loadProject(id, scope);
  }

  async remove(id: string, scope: IBatchProjectScope): Promise<void> {
    await this.requireProject(id, scope);
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

  async addItems(
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

  async updateItem(
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
    await this.touchProject(id, scope);
    return this.loadProject(id, scope);
  }

  async removeItem(
    id: string,
    itemId: string,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    this.assertDraft(project);
    await this.requireItem(id, itemId, scope);
    await this.prisma.batchProjectItem.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(scope.organizationId, { id: itemId, projectId: id }),
    });
    await this.touchProject(id, scope);
    return this.loadProject(id, scope);
  }

  /**
   * Start generation for every queued item. The project is claimed with a
   * conditional DRAFT → GENERATING write first, so a double submit cannot
   * start two runs.
   */
  async start(id: string, scope: IBatchProjectScope): Promise<IBatchProject> {
    const project = await this.requireProjectWithItems(id, scope);
    this.assertDraft(project);
    const pending = project.items.filter(
      (item) => item.status === BatchProjectItemStatus.PENDING,
    );
    if (pending.length === 0) {
      throw new BadRequestException('Add at least one input before starting');
    }
    if (project.kind === BatchProjectKind.WORKFLOW && !project.workflowId) {
      throw new BadRequestException('Choose a workflow before starting');
    }

    const claim = await this.prisma.batchProject.updateMany({
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

    const dispatchedAt = new Date();
    if (project.kind === BatchProjectKind.WORKFLOW && project.workflowId) {
      let executionId: string;
      try {
        executionId =
          await this.batchWorkflowExecutionService.startBatchExecution({
            ingredientIds: pending.flatMap((item) =>
              item.inputIngredientId ? [item.inputIngredientId] : [],
            ),
            organizationId: scope.organizationId,
            userId: scope.userId,
            workflowId: project.workflowId,
          });
      } catch (error: unknown) {
        await this.prisma.batchProject.updateMany({
          data: {
            status: BatchProjectStatus.DRAFT,
            step: BatchProjectStep.INPUTS,
          },
          where: scopedWhere(scope.organizationId, { id }),
        });
        throw error;
      }
      await this.prisma.$transaction(
        pending.map((item, index) =>
          this.prisma.batchProjectItem.updateMany({
            data: {
              dispatchedAt,
              status: BatchProjectItemStatus.GENERATING,
              workflowExecutionId: executionId,
              workflowItemIndex: index,
            },
            where: scopedWhere(scope.organizationId, { id: item.id }),
          }),
        ),
      );
    } else {
      await this.prisma.batchProjectItem.updateMany({
        data: { dispatchedAt, status: BatchProjectItemStatus.GENERATING },
        where: scopedWhere(scope.organizationId, {
          id: { in: pending.map((item) => item.id) },
        }),
      });
    }

    this.logger.log('Batch project started', {
      batchProjectId: id,
      context: this.context,
      itemCount: pending.length,
      kind: project.kind,
      organizationId: scope.organizationId,
    });
    return this.loadProject(id, scope);
  }

  /** Record the browser-side dispatch outcome of one idea item. */
  async dispatchItem(
    id: string,
    itemId: string,
    dto: DispatchBatchProjectItemDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    if (project.kind !== BatchProjectKind.IDEAS) {
      throw new BadRequestException('Only idea items are dispatched');
    }
    const item = await this.requireItem(id, itemId, scope);
    if (
      item.status !== BatchProjectItemStatus.GENERATING ||
      item.outputIngredientId
    ) {
      throw new ConflictException('This item is not waiting for a dispatch');
    }

    if (dto.ingredientId) {
      const ingredient = await this.prisma.ingredient.findFirst({
        select: { category: true, id: true },
        where: scopedWhere(scope.organizationId, { id: dto.ingredientId }),
      });
      if (!ingredient) {
        throw new BadRequestException(
          'The generated asset does not belong to this organization',
        );
      }
      await this.prisma.batchProjectItem.updateMany({
        data: {
          outputCategory: ingredient.category,
          outputIngredientId: ingredient.id,
        },
        where: scopedWhere(scope.organizationId, {
          id: itemId,
          outputIngredientId: null,
          status: BatchProjectItemStatus.GENERATING,
        }),
      });
    } else if (dto.error) {
      await this.prisma.batchProjectItem.updateMany({
        data: { error: dto.error, status: BatchProjectItemStatus.FAILED },
        where: scopedWhere(scope.organizationId, {
          id: itemId,
          status: BatchProjectItemStatus.GENERATING,
        }),
      });
      await this.reconcileService.refreshProjectStatus(
        id,
        scope.organizationId,
      );
    } else {
      throw new BadRequestException('Send the ingredient id or the error');
    }
    return this.loadProject(id, scope);
  }

  /** Rerun one failed item without touching the others. */
  async retryItem(
    id: string,
    itemId: string,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    const project = await this.requireProject(id, scope);
    const item = await this.requireItem(id, itemId, scope);
    if (item.status !== BatchProjectItemStatus.FAILED) {
      throw new BadRequestException('Only a failed item can be retried');
    }

    let workflowExecutionId: string | null = null;
    if (project.kind === BatchProjectKind.WORKFLOW) {
      if (!project.workflowId || !item.inputIngredientId) {
        throw new BadRequestException('This item has no workflow input');
      }
      workflowExecutionId =
        await this.batchWorkflowExecutionService.startBatchExecution({
          ingredientIds: [item.inputIngredientId],
          organizationId: scope.organizationId,
          userId: scope.userId,
          workflowId: project.workflowId,
        });
    }

    const retried = await this.prisma.batchProjectItem.updateMany({
      data: {
        dispatchedAt: new Date(),
        error: null,
        outputCategory: null,
        outputIngredientId: null,
        status: BatchProjectItemStatus.GENERATING,
        ...(workflowExecutionId
          ? { workflowExecutionId, workflowItemIndex: 0 }
          : {}),
      },
      where: scopedWhere(scope.organizationId, {
        id: itemId,
        status: BatchProjectItemStatus.FAILED,
      }),
    });
    if (retried.count !== 1) {
      throw new ConflictException('This item is already being retried');
    }
    await this.reconcileService.refreshProjectStatus(id, scope.organizationId);

    this.logger.log('Batch project item retried', {
      batchProjectId: id,
      batchProjectItemId: itemId,
      context: this.context,
      organizationId: scope.organizationId,
    });
    return this.loadProject(id, scope);
  }

  /**
   * Approve or reject through the review inbox itself, so the decision is the
   * one the inbox shows; project items then mirror the recorded decision.
   */
  async review(
    id: string,
    dto: ReviewBatchProjectItemsDto,
    scope: IBatchProjectScope,
  ): Promise<IBatchProject> {
    await this.requireProject(id, scope);
    const items = await this.prisma.batchProjectItem.findMany({
      where: scopedWhere(scope.organizationId, {
        id: { in: dto.itemIds },
        projectId: id,
      }),
    });
    if (items.length !== new Set(dto.itemIds).size) {
      throw new NotFoundException('Batch project item');
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

  /**
   * Schedule every approved item through the shared post scheduling path,
   * once per destination. The first destination schedules the item's review
   * draft; every further destination gets its own draft so each keeps its own
   * time. A destination without a date publishes now.
   */
  async schedule(
    id: string,
    dto: ScheduleBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IScheduleBatchProjectResult> {
    const project = await this.requireProjectWithItems(id, scope);
    const approved = project.items.filter(
      (item) =>
        item.status === BatchProjectItemStatus.APPROVED &&
        !item.scheduledAt &&
        item.postId &&
        item.outputIngredientId,
    );
    if (approved.length === 0) {
      throw new BadRequestException(
        'Approve at least one item before scheduling',
      );
    }

    const credentialIds = [
      ...new Set(dto.targets.map((target) => target.credentialId)),
    ];
    const credentials = await this.prisma.credential.findMany({
      select: { id: true, platform: true },
      where: scopedWhere(scope.organizationId, {
        brandId: project.brandId,
        id: { in: credentialIds },
      }),
    });
    const credentialsById = new Map(
      credentials.map((credential) => [credential.id, credential]),
    );
    if (credentialsById.size !== credentialIds.length) {
      throw new BadRequestException(
        'One or more accounts are not connected to this brand',
      );
    }

    const now = new Date().toISOString();
    const scheduledItemIds = new Set<string>();
    let scheduledCount = 0;
    let failedCount = 0;

    for (const [targetIndex, target] of dto.targets.entries()) {
      const credential = credentialsById.get(target.credentialId);
      const platform = fromPrismaCredentialPlatform(credential?.platform);
      if (!credential || !platform) {
        failedCount += approved.length;
        continue;
      }

      const entries: Array<{
        caption: string;
        item: BatchProjectItem;
        postId: string;
      }> = [];
      for (const item of approved) {
        const caption = this.resolveCaption(item, dto.captions);
        const postId =
          targetIndex === 0 && item.postId
            ? item.postId
            : await this.createTargetDraft(project, item, caption, scope);
        entries.push({ caption, item, postId });
      }

      try {
        const result = await this.postsService.batchSchedule(
          entries.map((entry) => ({
            ingredientIds: entry.item.outputIngredientId
              ? [entry.item.outputIngredientId]
              : [],
            postId: entry.postId,
            scheduledDate: target.scheduledDate ?? now,
            text: entry.caption,
          })),
          scope.organizationId,
          { credentialId: credential.id, platform },
          scope.userId,
        );
        const scheduledPostIds = new Set(
          result.posts.map((post) => String(post.id)),
        );
        for (const entry of entries) {
          if (scheduledPostIds.has(entry.postId)) {
            scheduledItemIds.add(entry.item.id);
            scheduledCount += 1;
          } else {
            failedCount += 1;
          }
        }
      } catch (error: unknown) {
        failedCount += entries.length;
        this.logger.error(
          'Batch project destination failed to schedule',
          error,
          {
            batchProjectId: id,
            context: this.context,
            credentialId: credential.id,
            organizationId: scope.organizationId,
          },
        );
      }
    }

    if (scheduledItemIds.size > 0) {
      await this.prisma.batchProjectItem.updateMany({
        data: { scheduledAt: new Date() },
        where: scopedWhere(scope.organizationId, {
          id: { in: [...scheduledItemIds] },
        }),
      });
    }
    await this.prisma.batchProject.updateMany({
      data: {
        settings: toPrismaJson(
          mergeBatchProjectSettings(project.settings, {
            schedule: {
              targets: dto.targets.map((target) => ({
                ...target,
                isSelected: true,
              })),
              ...(dto.timezone ? { timezone: dto.timezone } : {}),
            },
          }),
        ),
        step: BatchProjectStep.SCHEDULE,
      },
      where: scopedWhere(scope.organizationId, { id }),
    });
    await this.reconcileService.refreshProjectStatus(id, scope.organizationId);

    this.logger.log('Batch project scheduled', {
      batchProjectId: id,
      context: this.context,
      failedCount,
      organizationId: scope.organizationId,
      scheduledCount,
    });
    return { failedCount, scheduledCount };
  }

  private resolveCaption(
    item: BatchProjectItem,
    captions: Record<string, string> | undefined,
  ): string {
    const override = captions?.[item.id];
    const caption =
      typeof override === 'string'
        ? override
        : (item.caption ?? readBatchProjectIdea(item.idea)?.caption ?? '');
    return caption.trim();
  }

  private async createTargetDraft(
    project: BatchProject,
    item: BatchProjectItem,
    caption: string,
    scope: IBatchProjectScope,
  ): Promise<string> {
    const idea = readBatchProjectIdea(item.idea);
    const draft = {
      brandId: project.brandId,
      category:
        item.outputCategory === IngredientCategory.VIDEO
          ? PostCategory.VIDEO
          : PostCategory.IMAGE,
      description: caption,
      ingredients: item.outputIngredientId ? [item.outputIngredientId] : [],
      label:
        idea?.hook?.slice(0, 100) || `${project.name} #${item.position + 1}`,
      organizationId: scope.organizationId,
      sourceActionId: batchProjectItemSourceKey(item.id),
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: scope.userId,
      visibility: PostVisibility.PUBLIC,
    } satisfies PostCreateInput;
    const post = await this.postsService.create(draft);
    return String(post.id);
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
        data: { updatedAt: new Date() },
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
        data: { updatedAt: new Date() },
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

  private async assertIdeasEnabled(organizationId: string): Promise<void> {
    const settings = await this.prisma.organizationSetting.findFirst({
      select: { isFastlaneEnabled: true },
      where: { organizationId },
    });
    if (!settings?.isFastlaneEnabled) {
      throw new ForbiddenException(
        'Idea batches are not enabled for this organization',
      );
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
  ): Promise<ProjectWithItems> {
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
    return this.toProject(await this.requireProjectWithItems(id, scope));
  }

  private toProjectBase(
    row: BatchProject,
  ): Omit<IBatchProject, 'itemCounts' | 'items'> {
    return {
      brandId: row.brandId,
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      isDeleted: row.isDeleted,
      kind: row.kind as BatchProjectKind,
      name: row.name,
      organizationId: row.organizationId,
      reviewBatchId: row.reviewBatchId,
      settings: parseBatchProjectSettings(row.settings),
      status: row.status as BatchProjectStatus,
      step: row.step as BatchProjectStep,
      updatedAt: row.updatedAt.toISOString(),
      userId: row.userId,
      workflowId: row.workflowId,
    };
  }

  private toProject(row: ProjectWithItems): IBatchProject {
    return {
      ...this.toProjectBase(row),
      itemCounts: countBatchProjectItems(row.items),
      items: row.items.map((item) => this.toItem(item)),
    };
  }

  private toItem(item: BatchProjectItem): IBatchProjectItem {
    return {
      caption: item.caption,
      createdAt: item.createdAt.toISOString(),
      dispatchedAt: toIsoString(item.dispatchedAt),
      error: item.error,
      id: item.id,
      idea: readBatchProjectIdea(item.idea),
      inputCategory: item.inputCategory,
      inputIngredientId: item.inputIngredientId,
      outputCategory: item.outputCategory,
      outputIngredientId: item.outputIngredientId,
      position: item.position,
      postId: item.postId,
      projectId: item.projectId,
      reviewBatchId: item.reviewBatchId,
      reviewItemId: item.reviewItemId,
      scheduledAt: toIsoString(item.scheduledAt),
      status: item.status as BatchProjectItemStatus,
      updatedAt: item.updatedAt.toISOString(),
      workflowExecutionId: item.workflowExecutionId,
      workflowItemIndex: item.workflowItemIndex,
    };
  }
}
