import { BatchProjectCreditsService } from '@api/collections/batch-projects/services/batch-project-credits.service';
import { parseBatchProjectItemDispatch } from '@api/collections/batch-projects/services/batch-project-dispatch.util';
import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import { BatchProjectIdeaDispatchService } from '@api/collections/batch-projects/services/batch-project-idea-dispatch.service';
import {
  type BatchProjectItemStatusValue,
  deriveBatchProjectStatus,
} from '@api/collections/batch-projects/services/batch-project-status.util';
import {
  batchChildExecutionKey,
  readBatchChildWorkflowVersionId,
  readWorkflowOutputIngredientIds,
} from '@api/collections/batch-projects/services/batch-project-workflow-output.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  ContentFormat,
  IngredientCategory,
  IngredientStatus,
  parseReviewDecision,
  ReviewDecision,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  IBatchItem,
  IBatchSummary,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

/** A workflow run claimed for an item but never recorded is failed after this. */
export const UNRECORDED_RUN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * A claimed idea whose job has not started this long may never have been
 * queued (the process stopped between the claim and the enqueue).
 */
export const IDEA_REQUEUE_AFTER_MS = 2 * 60 * 1000;
const RECONCILE_LOCK_TTL_SECONDS = 120;
const SWEEP_BATCH_SIZE = 50;
/** Creator actions wait this long for an in-flight reconcile to finish. */
const EXCLUSIVE_LOCK_ATTEMPTS = 20;
const EXCLUSIVE_LOCK_RETRY_MS = 250;

function reconcileLockKey(projectId: string): string {
  return `batch-project-reconcile:${projectId}`;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const OUTPUT_CATEGORIES = [IngredientCategory.IMAGE, IngredientCategory.VIDEO];
const READY_INGREDIENT_STATUSES = new Set<string>([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);
const FAILED_INGREDIENT_STATUSES = new Set<string>([
  IngredientStatus.ARCHIVED,
  IngredientStatus.FAILED,
  IngredientStatus.REJECTED,
]);
const TERMINAL_EXECUTION_STATUSES = new Set<string>([
  WorkflowExecutionStatus.CANCELLED,
  WorkflowExecutionStatus.COMPLETED,
  WorkflowExecutionStatus.FAILED,
]);
const REVIEWABLE_ITEM_STATUSES = [
  BatchProjectItemStatus.APPROVED,
  BatchProjectItemStatus.READY,
  BatchProjectItemStatus.REJECTED,
];

type ProjectWithItems = BatchProject & { items: BatchProjectItem[] };

type ItemOutcome =
  | {
      category: string;
      ingredientId: string;
      item: BatchProjectItem;
      kind: 'completed';
    }
  | { error: string; item: BatchProjectItem; kind: 'failed' };

type OutputIngredient = { category: string; id: string };

/** Lineage key tying a review inbox item back to its batch project item. */
export function batchProjectItemSourceKey(itemId: string): string {
  return `batch-project-item:${itemId}`;
}

/** Idempotency key of the workflow run a batch project start enqueues. */
export function batchProjectStartKey(
  projectId: string,
  dispatchedAt: Date,
): string {
  return `batch-project:${projectId}:start:${dispatchedAt.toISOString()}`;
}

/** Idempotency key of the workflow run one item retry enqueues. */
export function batchProjectRetryKey(itemId: string, attempt: number): string {
  return `${batchProjectItemSourceKey(itemId)}:retry:${attempt}`;
}

/**
 * Moves a batch project forward from server state alone, so generation that
 * continues after the creator leaves still lands (#5463). Idea items resolve
 * from their generated ingredient; workflow items from the batch execution's
 * per-item child runs. Finished outputs enter the shared review inbox, and
 * review decisions made there flow back onto the project items.
 */
@Injectable()
export class BatchProjectReconcileService {
  private readonly context = BatchProjectReconcileService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly cacheService: CacheService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly credits: BatchProjectCreditsService,
    private readonly ideaDispatcher: BatchProjectIdeaDispatchService,
  ) {}

  /** Reconcile one project; a concurrent reconcile of it makes this a no-op. */
  async reconcileProject(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    await this.cacheService.withLock(
      reconcileLockKey(projectId),
      () => this.reconcileLocked(projectId, organizationId),
      RECONCILE_LOCK_TTL_SECONDS,
    );
  }

  /**
   * Run a creator action that changes item state (start, retry, schedule)
   * holding the same lock reconciliation takes, so neither can observe or
   * overwrite the other's half-applied state. Waits briefly for an in-flight
   * reconcile, then reports the project as busy.
   */
  async runExclusive<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockKey = reconcileLockKey(projectId);
    for (let attempt = 0; attempt < EXCLUSIVE_LOCK_ATTEMPTS; attempt++) {
      if (
        await this.cacheService.acquireLock(lockKey, RECONCILE_LOCK_TTL_SECONDS)
      ) {
        try {
          return await operation();
        } finally {
          await this.cacheService.releaseLock(lockKey);
        }
      }
      if (attempt < EXCLUSIVE_LOCK_ATTEMPTS - 1) {
        await wait(EXCLUSIVE_LOCK_RETRY_MS);
      }
    }
    throw new ConflictException(
      'This batch is updating. Try again in a moment.',
    );
  }

  /**
   * Platform sweep: advance every project with generation in flight. Walks
   * all of them page by page (stable id cursor), so projects that stay
   * generating or keep failing cannot starve the rest.
   */
  async reconcileGeneratingProjects(): Promise<number> {
    let cursor: string | undefined;
    let reconciled = 0;
    for (;;) {
      // tenant-scope-ignore: platform maintenance sweep — it must see generating batch projects across every organization, and each reconcile is scoped by the row's own organizationId
      const projects = await this.prisma.batchProject.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, organizationId: true },
        take: SWEEP_BATCH_SIZE,
        where: {
          isDeleted: false,
          status: BatchProjectStatus.GENERATING,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
      });

      for (const project of projects) {
        try {
          await this.reconcileProject(project.id, project.organizationId);
        } catch (error: unknown) {
          this.logger.error('Batch project reconcile failed', error, {
            batchProjectId: project.id,
            context: this.context,
            organizationId: project.organizationId,
          });
        }
      }
      reconciled += projects.length;

      if (projects.length < SWEEP_BATCH_SIZE) {
        return reconciled;
      }
      cursor = projects[projects.length - 1]?.id;
    }
  }

  /** Recompute and persist the project state its items imply. */
  async refreshProjectStatus(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const project = await this.prisma.batchProject.findFirst({
      select: {
        items: {
          select: { scheduledAt: true, status: true },
          where: { isDeleted: false, organizationId },
        },
        status: true,
      },
      where: scopedWhere(organizationId, { id: projectId }),
    });
    if (!project) {
      return;
    }
    const next = deriveBatchProjectStatus(project.items, project.status);
    if (next !== project.status) {
      await this.prisma.batchProject.updateMany({
        data: { status: next },
        where: scopedWhere(organizationId, { id: projectId }),
      });
    }
  }

  private async reconcileLocked(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const project = await this.loadProject(projectId, organizationId);
    if (!project) {
      return;
    }

    const resolved =
      project.kind === BatchProjectKind.WORKFLOW
        ? await this.resolveWorkflowOutcomes(project)
        : await this.resolveIdeaOutcomes(project);
    // Idea credits settle before an output counts as done and release before
    // a failure is recorded; an outcome whose settlement fails waits for the
    // next reconcile instead of leaving its hold unaccounted.
    const outcomes: ItemOutcome[] = [];
    for (const outcome of resolved) {
      if (await this.settleIdeaCredits(project, outcome)) {
        outcomes.push(outcome);
      }
    }

    for (const outcome of outcomes) {
      if (outcome.kind === 'failed') {
        await this.updateItemIfStatus(
          outcome.item,
          BatchProjectItemStatus.GENERATING,
          {
            error: outcome.error,
            status: BatchProjectItemStatus.FAILED,
          },
        );
        this.logger.warn('Batch project item failed', {
          batchProjectId: project.id,
          batchProjectItemId: outcome.item.id,
          context: this.context,
          error: outcome.error,
          organizationId,
        });
      }
    }

    const completed = outcomes.filter(
      (outcome): outcome is Extract<ItemOutcome, { kind: 'completed' }> =>
        outcome.kind === 'completed',
    );
    if (completed.length > 0) {
      await this.handOffToReview(project, completed);
    }

    await this.syncReviewDecisions(projectId, organizationId);
    await this.refreshProjectStatus(projectId, organizationId);
  }

  /**
   * Settle a finished idea's reserved line (only usable output is charged)
   * or release a failed one's. Returns false when the credit write failed and
   * the outcome must wait for the next reconcile.
   */
  private async settleIdeaCredits(
    project: ProjectWithItems,
    outcome: ItemOutcome,
  ): Promise<boolean> {
    const dispatch = parseBatchProjectItemDispatch(outcome.item.dispatch);
    if (dispatch?.state !== 'reserved') {
      return true;
    }
    try {
      let state: 'released' | 'settled' = 'released';
      if (outcome.kind === 'completed') {
        state = await this.credits.settle({
          actorUserId: project.userId,
          description: `Batch idea ${outcome.category.toLowerCase()} generation`,
          dispatch,
          organizationId: project.organizationId,
          source:
            outcome.category === IngredientCategory.IMAGE
              ? ActivitySource.IMAGE_GENERATION
              : ActivitySource.VIDEO_GENERATION,
        });
      } else {
        await this.credits.release({
          dispatch,
          organizationId: project.organizationId,
        });
      }
      await this.prisma.batchProjectItem.updateMany({
        data: { dispatch: toPrismaJson({ ...dispatch, state }) },
        where: scopedWhere(project.organizationId, {
          dispatch: { equals: dispatch.key, path: ['key'] },
          id: outcome.item.id,
        }),
      });
      return true;
    } catch (error: unknown) {
      this.logger.error('Batch project idea credits did not settle', error, {
        batchProjectId: project.id,
        batchProjectItemId: outcome.item.id,
        context: this.context,
        organizationId: project.organizationId,
      });
      return false;
    }
  }

  private loadProject(
    projectId: string,
    organizationId: string,
  ): Promise<ProjectWithItems | null> {
    return this.prisma.batchProject.findFirst({
      include: {
        items: {
          orderBy: { position: 'asc' },
          where: { isDeleted: false, organizationId },
        },
      },
      where: scopedWhere(organizationId, { id: projectId }),
    });
  }

  /**
   * Queue again every claimed idea whose job never started. The job id is the
   * attempt's dispatch key, so a job that is still queued is not added twice,
   * and a job that already ran skips an attempt that is no longer queued.
   */
  private async requeueUnstartedIdeas(
    project: ProjectWithItems,
    generating: BatchProjectItem[],
  ): Promise<void> {
    const deadline = Date.now() - IDEA_REQUEUE_AFTER_MS;
    for (const item of generating) {
      const dispatch = parseBatchProjectItemDispatch(item.dispatch);
      if (
        item.outputIngredientId ||
        dispatch?.state !== 'queued' ||
        (item.dispatchedAt?.getTime() ?? 0) >= deadline
      ) {
        continue;
      }
      try {
        await this.ideaDispatcher.enqueue({
          itemId: item.id,
          key: dispatch.key,
          organizationId: project.organizationId,
          projectId: project.id,
          userId: project.userId,
        });
      } catch (error: unknown) {
        this.logger.warn('Batch project idea could not be queued again', {
          batchProjectId: project.id,
          batchProjectItemId: item.id,
          context: this.context,
          error: error instanceof Error ? error.message : String(error),
          organizationId: project.organizationId,
        });
      }
    }
  }

  private async resolveIdeaOutcomes(
    project: ProjectWithItems,
  ): Promise<ItemOutcome[]> {
    const generating = project.items.filter(
      (item) => item.status === BatchProjectItemStatus.GENERATING,
    );
    const ingredientIds = generating.flatMap((item) =>
      item.outputIngredientId ? [item.outputIngredientId] : [],
    );
    const ingredients =
      ingredientIds.length > 0
        ? await this.prisma.ingredient.findMany({
            select: {
              category: true,
              generationError: true,
              id: true,
              status: true,
            },
            where: scopedWhere(project.organizationId, {
              id: { in: ingredientIds },
            }),
          })
        : [];
    const ingredientsById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    await this.requeueUnstartedIdeas(project, generating);

    return generating.flatMap((item): ItemOutcome[] => {
      // Not dispatched yet: its durable job is still queued, or its failure
      // workflow will fail it.
      if (!item.outputIngredientId) {
        return [];
      }
      const ingredient = ingredientsById.get(item.outputIngredientId);
      if (!ingredient) {
        return [{ error: 'Generated asset not found', item, kind: 'failed' }];
      }
      if (READY_INGREDIENT_STATUSES.has(ingredient.status)) {
        return [
          {
            category: ingredient.category,
            ingredientId: ingredient.id,
            item,
            kind: 'completed',
          },
        ];
      }
      if (FAILED_INGREDIENT_STATUSES.has(ingredient.status)) {
        return [
          {
            error: ingredient.generationError ?? 'Generation failed',
            item,
            kind: 'failed',
          },
        ];
      }
      return [];
    });
  }

  private async resolveWorkflowOutcomes(
    project: ProjectWithItems,
  ): Promise<ItemOutcome[]> {
    const outcomes: ItemOutcome[] = [];
    const byExecution = new Map<string, BatchProjectItem[]>();
    const dispatchDeadline = Date.now() - UNRECORDED_RUN_TIMEOUT_MS;
    for (const item of project.items) {
      if (item.status !== BatchProjectItemStatus.GENERATING) {
        continue;
      }
      const executionId =
        item.workflowExecutionId ??
        (await this.recoverUnrecordedRun(project, item));
      if (!executionId || item.workflowItemIndex === null) {
        // Claimed for a run that never started (the start or retry failed
        // half-way); let the creator retry it.
        if ((item.dispatchedAt?.getTime() ?? 0) < dispatchDeadline) {
          outcomes.push({
            error: 'The workflow run did not start. Retry this item.',
            item,
            kind: 'failed',
          });
        }
        continue;
      }
      const group = byExecution.get(executionId) ?? [];
      group.push({ ...item, workflowExecutionId: executionId });
      byExecution.set(executionId, group);
    }

    for (const [executionId, items] of byExecution) {
      outcomes.push(
        ...(await this.resolveExecutionOutcomes(
          project.organizationId,
          executionId,
          items,
        )),
      );
    }
    return outcomes;
  }

  /**
   * A run can be enqueued while saving its id onto the item fails. Find it by
   * the attempt's deterministic key and link it, so the paid run is followed
   * instead of being failed and run a second time.
   */
  private async recoverUnrecordedRun(
    project: ProjectWithItems,
    item: BatchProjectItem,
  ): Promise<string | null> {
    if (!item.dispatchedAt || item.workflowItemIndex === null) {
      return null;
    }
    const idempotencyKey =
      item.retryCount > 0
        ? batchProjectRetryKey(item.id, item.retryCount)
        : batchProjectStartKey(project.id, item.dispatchedAt);
    const execution = await this.prisma.workflowExecution.findFirst({
      select: { id: true },
      where: scopedWhere(project.organizationId, { idempotencyKey }),
    });
    if (!execution) {
      return null;
    }
    await this.prisma.batchProjectItem.updateMany({
      data: { workflowExecutionId: execution.id },
      where: scopedWhere(project.organizationId, {
        id: item.id,
        retryCount: item.retryCount,
        status: BatchProjectItemStatus.GENERATING,
        workflowExecutionId: null,
      }),
    });
    return execution.id;
  }

  private async resolveExecutionOutcomes(
    organizationId: string,
    parentExecutionId: string,
    items: BatchProjectItem[],
  ): Promise<ItemOutcome[]> {
    const parent = await this.prisma.workflowExecution.findFirst({
      select: { error: true, id: true, result: true, status: true },
      where: scopedWhere(organizationId, { id: parentExecutionId }),
    });
    if (!parent) {
      return items.map((item) => ({
        error: 'Workflow run not found',
        item,
        kind: 'failed' as const,
      }));
    }

    const childWorkflowVersionId = readBatchChildWorkflowVersionId(
      parent.result,
    );
    const keyByItemId = new Map<string, string>();
    if (childWorkflowVersionId) {
      for (const item of items) {
        keyByItemId.set(
          item.id,
          batchChildExecutionKey({
            childWorkflowVersionId,
            index: item.workflowItemIndex ?? 0,
            parentExecutionId,
          }),
        );
      }
    }
    const children =
      keyByItemId.size > 0
        ? await this.prisma.workflowExecution.findMany({
            select: {
              error: true,
              id: true,
              idempotencyKey: true,
              status: true,
            },
            where: scopedWhere(organizationId, {
              idempotencyKey: { in: [...keyByItemId.values()] },
            }),
          })
        : [];
    const childByKey = new Map(
      children.map((child) => [child.idempotencyKey, child]),
    );
    const isParentTerminal = TERMINAL_EXECUTION_STATUSES.has(parent.status);

    const outcomes: ItemOutcome[] = [];
    for (const item of items) {
      const key = keyByItemId.get(item.id);
      const child = key ? childByKey.get(key) : undefined;
      if (child?.status === WorkflowExecutionStatus.COMPLETED) {
        const output = await this.findOutputIngredient(
          organizationId,
          child.id,
        );
        outcomes.push(
          output
            ? {
                category: output.category,
                ingredientId: output.id,
                item,
                kind: 'completed',
              }
            : {
                error: 'The workflow finished without an image or video output',
                item,
                kind: 'failed',
              },
        );
      } else if (
        child?.status === WorkflowExecutionStatus.FAILED ||
        child?.status === WorkflowExecutionStatus.CANCELLED
      ) {
        outcomes.push({
          error: child.error ?? 'Workflow run failed',
          item,
          kind: 'failed',
        });
      } else if (!child && isParentTerminal) {
        outcomes.push({
          error:
            parent.error ?? 'The workflow batch ended before this item ran',
          item,
          kind: 'failed',
        });
      }
    }
    return outcomes;
  }

  /**
   * The child run's output: an ingredient id its nodes return (last node
   * first, tenant-validated), else the newest media ingredient linked to the
   * run. Ids win so a node that returns its final output (e.g. a stitched
   * video) is never shadowed by an earlier intermediate clip.
   */
  private async findOutputIngredient(
    organizationId: string,
    childExecutionId: string,
  ): Promise<OutputIngredient | null> {
    const nodeResults = await this.prisma.workflowExecutionNodeResult.findMany({
      orderBy: { completedAt: 'asc' },
      select: { output: true },
      where: { executionId: childExecutionId, organizationId },
    });
    const candidateIds = readWorkflowOutputIngredientIds(
      nodeResults.map((nodeResult) => nodeResult.output),
    );
    if (candidateIds.length > 0) {
      const candidates = await this.prisma.ingredient.findMany({
        select: { category: true, id: true },
        where: scopedWhere(organizationId, {
          category: { in: OUTPUT_CATEGORIES },
          id: { in: candidateIds },
        }),
      });
      const candidatesById = new Map(
        candidates.map((candidate) => [candidate.id, candidate]),
      );
      for (const id of candidateIds) {
        const candidate = candidatesById.get(id);
        if (candidate) {
          return candidate;
        }
      }
    }

    return this.prisma.ingredient.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { category: true, id: true },
      where: scopedWhere(organizationId, {
        category: { in: OUTPUT_CATEGORIES },
        workflowExecutionId: childExecutionId,
      }),
    });
  }

  /**
   * Add finished outputs to the project's review inbox batch — created with
   * the first output, appended to afterwards. `targetIdempotencyKey` makes a
   * retried hand-off reuse the draft Post it already created.
   */
  private async handOffToReview(
    project: ProjectWithItems,
    completed: Extract<ItemOutcome, { kind: 'completed' }>[],
  ): Promise<void> {
    const workflow = project.workflowId
      ? await this.prisma.workflow.findFirst({
          select: { label: true },
          where: scopedWhere(project.organizationId, {
            id: project.workflowId,
          }),
        })
      : null;
    const dto: CreateManualReviewBatchDto = {
      brandId: project.brandId,
      items: completed.map(({ category, ingredientId, item }) => {
        const idea = readBatchProjectIdea(item.idea);
        const sourceKey = batchProjectItemSourceKey(item.id);
        return {
          caption: item.caption ?? idea?.caption ?? undefined,
          format:
            category === IngredientCategory.VIDEO ||
            category === IngredientCategory.AVATAR
              ? ContentFormat.VIDEO
              : ContentFormat.IMAGE,
          ingredientId,
          label:
            idea?.hook?.slice(0, 100) ||
            `${project.name} #${item.position + 1}`,
          prompt: idea?.visualPrompt || undefined,
          sourceActionId: sourceKey,
          ...(project.workflowId
            ? {
                sourceWorkflowId: project.workflowId,
                sourceWorkflowName: workflow?.label ?? undefined,
              }
            : {}),
          targetIdempotencyKey: sourceKey,
          ...(item.workflowExecutionId
            ? { workflowExecutionId: item.workflowExecutionId }
            : {}),
        };
      }),
    };

    const summary = await this.submitForReview(project, dto);
    const reviewItemsBySource = new Map<string, IBatchItem>();
    for (const reviewItem of summary.items) {
      if (reviewItem.sourceActionId) {
        reviewItemsBySource.set(reviewItem.sourceActionId, reviewItem);
      }
    }

    for (const { category, ingredientId, item } of completed) {
      const reviewItem = reviewItemsBySource.get(
        batchProjectItemSourceKey(item.id),
      );
      await this.updateItemIfStatus(item, BatchProjectItemStatus.GENERATING, {
        error: null,
        outputCategory: category,
        outputIngredientId: ingredientId,
        postId: reviewItem?.postId ?? null,
        reviewBatchId: summary.id,
        reviewItemId: reviewItem?.id ?? null,
        status: BatchProjectItemStatus.READY,
      });
    }

    this.logger.log('Batch project outputs sent to review', {
      batchProjectId: project.id,
      context: this.context,
      itemCount: completed.length,
      organizationId: project.organizationId,
      reviewBatchId: summary.id,
    });
  }

  private async submitForReview(
    project: ProjectWithItems,
    dto: CreateManualReviewBatchDto,
  ): Promise<IBatchSummary> {
    if (project.reviewBatchId) {
      const summary = await this.appendIfLive(
        project,
        project.reviewBatchId,
        dto,
      );
      if (summary) {
        return summary;
      }
    }

    // A crash between creating the review batch and saving its id leaves a
    // batch that already holds these items; adopt it instead of a second one.
    const handedOffBatchId = await this.findHandedOffReviewBatchId(
      project.organizationId,
      dto,
    );
    const adopted = handedOffBatchId
      ? await this.appendIfLive(project, handedOffBatchId, dto)
      : null;
    const summary =
      adopted ??
      (await this.batchGenerationService.createManualReviewBatch(
        dto,
        project.userId,
        project.organizationId,
      ));
    await this.prisma.batchProject.updateMany({
      data: { reviewBatchId: summary.id },
      where: scopedWhere(project.organizationId, { id: project.id }),
    });
    return summary;
  }

  /** Append to a review batch; `null` when it was removed from the inbox. */
  private async appendIfLive(
    project: ProjectWithItems,
    reviewBatchId: string,
    dto: CreateManualReviewBatchDto,
  ): Promise<IBatchSummary | null> {
    try {
      return await this.batchGenerationService.appendManualReviewItems(
        reviewBatchId,
        dto,
        project.userId,
        project.organizationId,
      );
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return null;
      }
      throw error;
    }
  }

  /** The live review batch already holding one of these items, if any. */
  private async findHandedOffReviewBatchId(
    organizationId: string,
    dto: CreateManualReviewBatchDto,
  ): Promise<string | null> {
    const sourceKeys = dto.items.flatMap((item) =>
      item.sourceActionId ? [item.sourceActionId] : [],
    );
    if (sourceKeys.length === 0) {
      return null;
    }
    const row = await this.prisma.batchItem.findFirst({
      select: { batchId: true },
      where: scopedWhere(organizationId, {
        batch: { isDeleted: false, organizationId },
        OR: sourceKeys.map((sourceKey) => ({
          data: { equals: sourceKey, path: ['sourceActionId'] },
        })),
      }),
    });
    return row?.batchId ?? null;
  }

  /**
   * Mirror review-inbox decisions and caption edits onto the project's
   * reviewable items, so both surfaces show the same state.
   */
  async syncReviewDecisions(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const items = await this.prisma.batchProjectItem.findMany({
      where: scopedWhere(organizationId, {
        projectId,
        reviewItemId: { not: null },
        scheduledAt: null,
        status: { in: REVIEWABLE_ITEM_STATUSES },
      }),
    });
    const reviewItemIds = items.flatMap((item) =>
      item.reviewItemId ? [item.reviewItemId] : [],
    );
    if (reviewItemIds.length === 0) {
      return;
    }
    const reviewRows = await this.prisma.batchItem.findMany({
      select: { id: true, reviewDecision: true },
      where: scopedWhere(organizationId, { id: { in: reviewItemIds } }),
    });
    const decisionById = new Map(
      reviewRows.map((row) => [
        row.id,
        parseReviewDecision(row.reviewDecision).decision,
      ]),
    );
    const postIds = items.flatMap((item) => (item.postId ? [item.postId] : []));
    const posts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: { description: true, id: true },
            where: scopedWhere(organizationId, { id: { in: postIds } }),
          })
        : [];
    const captionByPostId = new Map(
      posts.map((post) => [post.id, post.description]),
    );

    for (const item of items) {
      const decision = item.reviewItemId
        ? decisionById.get(item.reviewItemId)
        : undefined;
      const next =
        decision === undefined ? item.status : toItemStatus(decision);
      const reviewedCaption = item.postId
        ? captionByPostId.get(item.postId)
        : undefined;
      const hasCaptionEdit =
        typeof reviewedCaption === 'string' && reviewedCaption !== item.caption;
      if (next !== item.status || hasCaptionEdit) {
        await this.updateItemIfStatus(item, item.status, {
          ...(next !== item.status ? { status: next } : {}),
          ...(hasCaptionEdit ? { caption: reviewedCaption } : {}),
        });
      }
    }
  }

  /**
   * Guarded write: only applies while the item still has the status this
   * reconcile read, so a concurrent creator action is never overwritten.
   */
  private updateItemIfStatus(
    item: BatchProjectItem,
    expected: BatchProjectItemStatusValue,
    data: Partial<
      Pick<
        BatchProjectItem,
        | 'caption'
        | 'error'
        | 'outputCategory'
        | 'outputIngredientId'
        | 'postId'
        | 'reviewBatchId'
        | 'reviewItemId'
        | 'status'
      >
    >,
  ) {
    return this.prisma.batchProjectItem.updateMany({
      data,
      where: scopedWhere(item.organizationId, {
        id: item.id,
        status: expected,
      }),
    });
  }
}

export function toItemStatus(decision: ReviewDecision): BatchProjectItemStatus {
  switch (decision) {
    case ReviewDecision.APPROVED:
      return BatchProjectItemStatus.APPROVED;
    case ReviewDecision.REJECTED:
      return BatchProjectItemStatus.REJECTED;
    default:
      return BatchProjectItemStatus.READY;
  }
}
