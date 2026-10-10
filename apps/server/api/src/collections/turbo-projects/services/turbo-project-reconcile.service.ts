import { TurboProjectCreditsService } from '@api/collections/turbo-projects/services/turbo-project-credits.service';
import { parseTurboProjectItemDispatch } from '@api/collections/turbo-projects/services/turbo-project-dispatch.util';
import { readTurboProjectIdea } from '@api/collections/turbo-projects/services/turbo-project-idea.util';
import { TurboProjectIdeaDispatchService } from '@api/collections/turbo-projects/services/turbo-project-idea-dispatch.service';
import { findReviewTurboRunIdBySourceKeys } from '@api/collections/turbo-projects/services/turbo-project-review-turbo-run.util';
import {
  type TurboProjectItemStatusValue,
  deriveTurboProjectStatus,
} from '@api/collections/turbo-projects/services/turbo-project-status.util';
import {
  batchChildExecutionKey,
  readBatchChildWorkflowVersionId,
  readWorkflowOutputIngredientIds,
} from '@api/collections/turbo-projects/services/turbo-project-workflow-output.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import type { CreateManualReviewTurboRunDto } from '@api/services/turbo-run/dto/create-manual-review-turbo-run.dto';
import { CacheService } from '@api/services/cache/cache.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  ContentFormat,
  IngredientCategory,
  IngredientStatus,
  parseReviewDecision,
  ReviewDecision,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type {
  ITurboRunItem,
  ITurboRunSummary,
} from '@genfeedai/contracts/interfaces';
import type { TurboProject, TurboProjectItem } from '@genfeedai/prisma';
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
  return `turbo-project-reconcile:${projectId}`;
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
  TurboProjectItemStatus.APPROVED,
  TurboProjectItemStatus.READY,
  TurboProjectItemStatus.REJECTED,
];

type ProjectWithItems = TurboProject & { items: TurboProjectItem[] };

type ItemOutcome =
  | {
      category: string;
      ingredientId: string;
      item: TurboProjectItem;
      kind: 'completed';
    }
  | { error: string; item: TurboProjectItem; kind: 'failed' };

type OutputIngredient = { category: string; id: string };

/** Lineage key tying a review inbox item back to its Turbo project item. */
export function turboProjectItemSourceKey(itemId: string): string {
  return `turbo-project-item:${itemId}`;
}

/** Idempotency key of the workflow run a Turbo project start enqueues. */
export function turboProjectStartKey(
  projectId: string,
  dispatchedAt: Date,
): string {
  return `turbo-project:${projectId}:start:${dispatchedAt.toISOString()}`;
}

/** Idempotency key of the workflow run one item retry enqueues. */
export function turboProjectRetryKey(itemId: string, attempt: number): string {
  return `${turboProjectItemSourceKey(itemId)}:retry:${attempt}`;
}

/**
 * Moves a Turbo project forward from server state alone, so generation that
 * continues after the creator leaves still lands (#5463). Idea items resolve
 * from their generated ingredient; workflow items from the project execution's
 * per-item child runs. Finished outputs enter the shared review inbox, and
 * review decisions made there flow back onto the project items.
 */
@Injectable()
export class TurboProjectReconcileService {
  private readonly context = TurboProjectReconcileService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly cacheService: CacheService,
    private readonly turboRunService: TurboRunService,
    private readonly credits: TurboProjectCreditsService,
    private readonly ideaDispatcher: TurboProjectIdeaDispatchService,
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
  /**
   * Mirror inbox decisions onto one project under its reconcile lock, so
   * the sync never interleaves with scheduling or a review action. A project
   * that is busy is skipped; its own operation syncs it.
   */
  async syncReviewState(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    await this.cacheService.withLock(
      reconcileLockKey(projectId),
      async () => {
        await this.syncReviewDecisions(projectId, organizationId);
        await this.refreshProjectStatus(projectId, organizationId);
      },
      RECONCILE_LOCK_TTL_SECONDS,
    );
  }

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
      'This project is updating. Try again in a moment.',
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
      // tenant-scope-ignore: platform maintenance sweep — it must see generating Turbo projects across every organization, and each reconcile is scoped by the row's own organizationId
      const projects = await this.prisma.turboProject.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, organizationId: true },
        take: SWEEP_BATCH_SIZE,
        where: {
          isDeleted: false,
          status: TurboProjectStatus.GENERATING,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
      });

      for (const project of projects) {
        try {
          await this.reconcileProject(project.id, project.organizationId);
        } catch (error: unknown) {
          this.logger.error('Turbo project reconcile failed', error, {
            turboProjectId: project.id,
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
    const project = await this.prisma.turboProject.findFirst({
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
    const next = deriveTurboProjectStatus(project.items, project.status);
    if (next !== project.status) {
      await this.prisma.turboProject.updateMany({
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
      project.kind === TurboProjectKind.WORKFLOW
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
          TurboProjectItemStatus.GENERATING,
          {
            error: outcome.error,
            status: TurboProjectItemStatus.FAILED,
          },
        );
        this.logger.warn('Turbo project item failed', {
          turboProjectId: project.id,
          turboProjectItemId: outcome.item.id,
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
    const dispatch = parseTurboProjectItemDispatch(outcome.item.dispatch);
    if (dispatch?.state !== 'reserved') {
      return true;
    }
    try {
      let state: 'released' | 'settled' = 'released';
      if (outcome.kind === 'completed') {
        state = await this.credits.settle({
          actorUserId: project.userId,
          brandId: project.brandId,
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
      await this.prisma.turboProjectItem.updateMany({
        data: { dispatch: toPrismaJson({ ...dispatch, state }) },
        where: scopedWhere(project.organizationId, {
          dispatch: { equals: dispatch.key, path: ['key'] },
          id: outcome.item.id,
        }),
      });
      return true;
    } catch (error: unknown) {
      this.logger.error('Turbo project idea credits did not settle', error, {
        turboProjectId: project.id,
        turboProjectItemId: outcome.item.id,
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
    return this.prisma.turboProject.findFirst({
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
    generating: TurboProjectItem[],
  ): Promise<void> {
    const deadline = Date.now() - IDEA_REQUEUE_AFTER_MS;
    for (const item of generating) {
      const dispatch = parseTurboProjectItemDispatch(item.dispatch);
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
        this.logger.warn('Turbo project idea could not be queued again', {
          turboProjectId: project.id,
          turboProjectItemId: item.id,
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
      (item) => item.status === TurboProjectItemStatus.GENERATING,
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
    const byExecution = new Map<string, TurboProjectItem[]>();
    const dispatchDeadline = Date.now() - UNRECORDED_RUN_TIMEOUT_MS;
    for (const item of project.items) {
      if (item.status !== TurboProjectItemStatus.GENERATING) {
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
    item: TurboProjectItem,
  ): Promise<string | null> {
    if (!item.dispatchedAt || item.workflowItemIndex === null) {
      return null;
    }
    const idempotencyKey =
      item.retryCount > 0
        ? turboProjectRetryKey(item.id, item.retryCount)
        : turboProjectStartKey(project.id, item.dispatchedAt);
    const execution = await this.prisma.workflowExecution.findFirst({
      select: { id: true },
      where: scopedWhere(project.organizationId, { idempotencyKey }),
    });
    if (!execution) {
      return null;
    }
    await this.prisma.turboProjectItem.updateMany({
      data: { workflowExecutionId: execution.id },
      where: scopedWhere(project.organizationId, {
        id: item.id,
        retryCount: item.retryCount,
        status: TurboProjectItemStatus.GENERATING,
        workflowExecutionId: null,
      }),
    });
    return execution.id;
  }

  private async resolveExecutionOutcomes(
    organizationId: string,
    parentExecutionId: string,
    items: TurboProjectItem[],
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
            parent.error ?? 'The workflow project ended before this item ran',
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
   * Add finished outputs to the project's review inbox project — created with
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
    const dto: CreateManualReviewTurboRunDto = {
      brandId: project.brandId,
      items: completed.map(({ category, ingredientId, item }) => {
        const idea = readTurboProjectIdea(item.idea);
        const sourceKey = turboProjectItemSourceKey(item.id);
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
    const reviewItemsBySource = new Map<string, ITurboRunItem>();
    for (const reviewItem of summary.items) {
      if (reviewItem.sourceActionId) {
        reviewItemsBySource.set(reviewItem.sourceActionId, reviewItem);
      }
    }

    for (const { category, ingredientId, item } of completed) {
      const reviewItem = reviewItemsBySource.get(
        turboProjectItemSourceKey(item.id),
      );
      await this.updateItemIfStatus(item, TurboProjectItemStatus.GENERATING, {
        error: null,
        outputCategory: category,
        outputIngredientId: ingredientId,
        postId: reviewItem?.postId ?? null,
        reviewTurboRunId: summary.id,
        reviewItemId: reviewItem?.id ?? null,
        status: TurboProjectItemStatus.READY,
      });
    }

    this.logger.log('Turbo project outputs sent to review', {
      turboProjectId: project.id,
      context: this.context,
      itemCount: completed.length,
      organizationId: project.organizationId,
      reviewTurboRunId: summary.id,
    });
  }

  private async submitForReview(
    project: ProjectWithItems,
    dto: CreateManualReviewTurboRunDto,
  ): Promise<ITurboRunSummary> {
    if (project.reviewTurboRunId) {
      const summary = await this.appendIfLive(
        project,
        project.reviewTurboRunId,
        dto,
      );
      if (summary) {
        return summary;
      }
    }

    // A crash between creating the review run and saving its id leaves a
    // project that already holds these items; adopt it instead of a second one.
    const handedOffTurboRunId = await findReviewTurboRunIdBySourceKeys(
      this.prisma,
      project.organizationId,
      dto.items.flatMap((item) =>
        item.sourceActionId ? [item.sourceActionId] : [],
      ),
    );
    const adopted = handedOffTurboRunId
      ? await this.appendIfLive(project, handedOffTurboRunId, dto)
      : null;
    const summary =
      adopted ??
      (await this.turboRunService.createManualReviewTurboRun(
        dto,
        project.userId,
        project.organizationId,
      ));
    await this.prisma.turboProject.updateMany({
      data: { reviewTurboRunId: summary.id },
      where: scopedWhere(project.organizationId, { id: project.id }),
    });
    return summary;
  }

  /** Append to a review run; `null` when it was removed from the inbox. */
  private async appendIfLive(
    project: ProjectWithItems,
    reviewTurboRunId: string,
    dto: CreateManualReviewTurboRunDto,
  ): Promise<ITurboRunSummary | null> {
    try {
      return await this.turboRunService.appendManualReviewItems(
        reviewTurboRunId,
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

  /**
   * Mirror review-inbox decisions and caption edits onto the project's
   * reviewable items, so both surfaces show the same state.
   */
  async syncReviewDecisions(
    projectId: string,
    organizationId: string,
  ): Promise<void> {
    const items = await this.prisma.turboProjectItem.findMany({
      where: scopedWhere(organizationId, {
        projectId,
        reviewItemId: { not: null },
        status: { in: REVIEWABLE_ITEM_STATUSES },
      }),
    });
    const reviewItemIds = items.flatMap((item) =>
      item.reviewItemId ? [item.reviewItemId] : [],
    );
    if (reviewItemIds.length === 0) {
      return;
    }
    const reviewRows = await this.prisma.turboRunItem.findMany({
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
      const withdrawn =
        next !== TurboProjectItemStatus.APPROVED && decision !== undefined;
      if (
        next !== item.status ||
        hasCaptionEdit ||
        (withdrawn && item.scheduledAt)
      ) {
        await this.updateItemIfStatus(item, item.status, {
          ...(next !== item.status ? { status: next } : {}),
          ...(withdrawn && item.scheduledAt ? { scheduledAt: null } : {}),
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
    item: TurboProjectItem,
    expected: TurboProjectItemStatusValue,
    data: Partial<
      Pick<
        TurboProjectItem,
        | 'caption'
        | 'error'
        | 'outputCategory'
        | 'outputIngredientId'
        | 'postId'
        | 'reviewTurboRunId'
        | 'reviewItemId'
        | 'status'
        | 'scheduledAt'
      >
    >,
  ) {
    return this.prisma.turboProjectItem.updateMany({
      data,
      where: scopedWhere(item.organizationId, {
        id: item.id,
        status: expected,
      }),
    });
  }
}

export function toItemStatus(decision: ReviewDecision): TurboProjectItemStatus {
  switch (decision) {
    case ReviewDecision.APPROVED:
      return TurboProjectItemStatus.APPROVED;
    case ReviewDecision.REJECTED:
      return TurboProjectItemStatus.REJECTED;
    default:
      return TurboProjectItemStatus.READY;
  }
}
