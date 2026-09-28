import type {
  BatchProjectScheduleTargetDto,
  ScheduleBatchProjectDto,
} from '@api/collections/batch-projects/dto/schedule-batch-project.dto';
import type { BatchProjectWithItems } from '@api/collections/batch-projects/services/batch-project.mapper';
import { readBatchProjectIdea } from '@api/collections/batch-projects/services/batch-project-idea.util';
import {
  BatchProjectReconcileService,
  batchProjectItemSourceKey,
} from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import {
  mergeBatchProjectSettings,
  parseScheduledTargets,
} from '@api/collections/batch-projects/services/batch-project-settings.util';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BatchProjectItemStatus,
  BatchProjectStep,
  fromPrismaCredentialPlatform,
  IngredientCategory,
  type Platform,
  PostCategory,
  PostVisibility,
  parseReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  IBatchProjectScheduledTarget,
  IBatchProjectScope,
  IScheduleBatchProjectResult,
} from '@genfeedai/contracts/interfaces';
import type { BatchProject, BatchProjectItem } from '@genfeedai/prisma';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

const SCHEDULED_EXECUTION_STATES = new Set<string>([
  TargetExecutionState.PUBLISHED,
  TargetExecutionState.PUBLISHING,
  TargetExecutionState.SCHEDULED,
]);

/** Everything one scheduling request shares across its destinations. */
type ScheduleRun = {
  approved: BatchProjectItem[];
  bindingsByItem: Map<string, IBatchProjectScheduledTarget[]>;
  dto: ScheduleBatchProjectDto;
  now: Date;
  project: BatchProjectWithItems;
  reviewPostById: ReadonlyMap<string, ReviewPost>;
  scope: IBatchProjectScope;
};

/** The review draft as the inbox left it: what the creator approved. */
type ReviewPost = {
  credentialId: string | null;
  description: string;
  id: string;
  ingredientIds: string[];
  targetExecutionState: string;
};

type ScheduleEntry = {
  caption: string;
  item: BatchProjectItem;
  postId: string;
};

type Destination = { credentialId: string; platform: Platform };

/**
 * Schedules a batch project's approved items through the shared post
 * scheduling path (#5463), once per destination, holding the project lock so
 * concurrent requests cannot double-schedule.
 *
 * An item's review draft goes to its first destination; every further
 * destination uses one draft per item and account (`targetIdempotencyKey`).
 * Each post is bound to its destination before it is scheduled, so a
 * partially failed call never hands it to another destination, and outcomes
 * are recorded per destination so only unfinished ones are retried. A
 * destination without a date publishes now.
 */
@Injectable()
export class BatchProjectSchedulingService {
  private readonly context = BatchProjectSchedulingService.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly reconcileService: BatchProjectReconcileService,
    private readonly postsService: PostsService,
  ) {}

  schedule(
    id: string,
    dto: ScheduleBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IScheduleBatchProjectResult> {
    return this.reconcileService.runExclusive(id, () =>
      this.scheduleLocked(id, dto, scope),
    );
  }

  private async scheduleLocked(
    id: string,
    dto: ScheduleBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<IScheduleBatchProjectResult> {
    const run = await this.prepareRun(id, dto, scope);
    const destinations = await this.resolveDestinations(run);

    let scheduledCount = 0;
    let failedCount = 0;
    for (const target of dto.targets) {
      const outcome = await this.scheduleDestination(
        run,
        target,
        destinations.get(target.credentialId),
      );
      scheduledCount += outcome.scheduledCount;
      failedCount += outcome.failedCount;
    }

    await this.prisma.batchProject.updateMany({
      data: {
        settings: toPrismaJson(
          mergeBatchProjectSettings(run.project.settings, {
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

  private async prepareRun(
    id: string,
    dto: ScheduleBatchProjectDto,
    scope: IBatchProjectScope,
  ): Promise<ScheduleRun> {
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
    const candidates = project.items.filter(
      (item) =>
        item.status === BatchProjectItemStatus.APPROVED &&
        item.postId &&
        item.reviewItemId &&
        item.outputIngredientId,
    );
    const { approved, reviewPosts } = await this.readCanonicalApprovals(
      candidates,
      scope,
    );
    if (approved.length === 0) {
      throw new BadRequestException(
        'Approve at least one item before scheduling',
      );
    }

    return {
      approved,
      bindingsByItem: new Map(
        approved.map((item) => [
          item.id,
          parseScheduledTargets(item.scheduledTargets),
        ]),
      ),
      dto,
      now: new Date(),
      project,
      reviewPostById: new Map(reviewPosts.map((post) => [post.id, post])),
      scope,
    };
  }

  /**
   * The project's APPROVED status mirrors the review inbox and can be stale.
   * Keep only items the inbox still approves and whose review draft still
   * exists, so content rejected there is never scheduled or cloned.
   */
  private async readCanonicalApprovals(
    candidates: BatchProjectItem[],
    scope: IBatchProjectScope,
  ): Promise<{
    approved: BatchProjectItem[];
    reviewPosts: ReviewPost[];
  }> {
    if (candidates.length === 0) {
      return { approved: [], reviewPosts: [] };
    }
    const [reviewRows, postRows] = await Promise.all([
      this.prisma.batchItem.findMany({
        select: { id: true, reviewDecision: true },
        where: scopedWhere(scope.organizationId, {
          id: {
            in: candidates.flatMap((item) =>
              item.reviewItemId ? [item.reviewItemId] : [],
            ),
          },
        }),
      }),
      this.prisma.post.findMany({
        select: {
          credentialId: true,
          description: true,
          id: true,
          ingredients: {
            select: { id: true },
            where: { isDeleted: false, organizationId: scope.organizationId },
          },
          targetExecutionState: true,
        },
        where: scopedWhere(scope.organizationId, {
          id: {
            in: candidates.flatMap((item) =>
              item.postId ? [item.postId] : [],
            ),
          },
        }),
      }),
    ]);
    const approvedReviewIds = new Set(
      reviewRows
        .filter(
          (row) =>
            parseReviewDecision(row.reviewDecision).decision ===
            ReviewDecision.APPROVED,
        )
        .map((row) => row.id),
    );
    const reviewPosts = postRows.map(
      (post): ReviewPost => ({
        credentialId: post.credentialId,
        description: post.description,
        id: post.id,
        ingredientIds: post.ingredients.map((ingredient) => ingredient.id),
        targetExecutionState: String(post.targetExecutionState),
      }),
    );
    const livePostIds = new Set(reviewPosts.map((post) => post.id));
    return {
      approved: candidates.filter(
        (item) =>
          item.reviewItemId !== null &&
          approvedReviewIds.has(item.reviewItemId) &&
          item.postId !== null &&
          livePostIds.has(item.postId),
      ),
      reviewPosts,
    };
  }

  /** Destinations must be accounts connected to the project's brand. */
  private async resolveDestinations(
    run: ScheduleRun,
  ): Promise<Map<string, Destination>> {
    const credentialIds = [
      ...new Set(run.dto.targets.map((target) => target.credentialId)),
    ];
    const credentials = await this.prisma.credential.findMany({
      select: { id: true, platform: true },
      where: scopedWhere(run.scope.organizationId, {
        brandId: run.project.brandId,
        id: { in: credentialIds },
      }),
    });
    const credentialsById = new Map(
      credentials.map((credential) => [credential.id, credential]),
    );
    if (
      !credentialIds.every((credentialId) => credentialsById.has(credentialId))
    ) {
      throw new BadRequestException(
        'One or more accounts are not connected to this brand',
      );
    }

    const destinations = new Map<string, Destination>();
    for (const credential of credentials) {
      const platform = fromPrismaCredentialPlatform(credential.platform);
      if (platform) {
        destinations.set(credential.id, {
          credentialId: credential.id,
          platform,
        });
      }
    }
    return destinations;
  }

  private async scheduleDestination(
    run: ScheduleRun,
    target: BatchProjectScheduleTargetDto,
    destination: Destination | undefined,
  ): Promise<IScheduleBatchProjectResult> {
    const due = run.approved.filter(
      (item) =>
        run.bindingsByItem
          .get(item.id)
          ?.find((binding) => binding.credentialId === target.credentialId)
          ?.status !== 'scheduled',
    );
    if (due.length === 0) {
      return { failedCount: 0, scheduledCount: 0 };
    }
    if (!destination) {
      return { failedCount: due.length, scheduledCount: 0 };
    }

    const entries: ScheduleEntry[] = [];
    for (const item of due) {
      entries.push(await this.bindEntry(run, item, destination));
    }

    // A pending binding can be a publish that went out before its outcome was
    // saved. Its post carries the operation (destination + publish approval),
    // so a post already scheduled there is recorded, never sent again.
    const scheduledPostIds = await this.readScheduledPostIds(
      entries.map((entry) => entry.postId),
      destination.credentialId,
      run.scope,
    );
    const toSchedule = entries.filter(
      (entry) => !scheduledPostIds.has(entry.postId),
    );
    if (toSchedule.length > 0) {
      const sent = await this.sendSchedule(
        run,
        target,
        destination,
        toSchedule,
      );
      for (const postId of sent) {
        scheduledPostIds.add(postId);
      }
    }

    let scheduledCount = 0;
    for (const entry of entries) {
      const isScheduled = scheduledPostIds.has(entry.postId);
      if (isScheduled) {
        scheduledCount += 1;
      }
      await this.writeBindings(
        run,
        entry.item,
        (run.bindingsByItem.get(entry.item.id) ?? []).map(
          (binding): IBatchProjectScheduledTarget =>
            binding.credentialId === destination.credentialId
              ? {
                  credentialId: binding.credentialId,
                  postId: binding.postId,
                  status: isScheduled ? 'scheduled' : 'failed',
                  ...(isScheduled
                    ? { scheduledAt: run.now.toISOString() }
                    : {}),
                }
              : binding,
        ),
      );
    }
    return { failedCount: entries.length - scheduledCount, scheduledCount };
  }

  /** Schedule entries on one destination; returns the posts that went out. */
  private async sendSchedule(
    run: ScheduleRun,
    target: BatchProjectScheduleTargetDto,
    destination: Destination,
    entries: ScheduleEntry[],
  ): Promise<Set<string>> {
    try {
      const result = await this.postsService.batchSchedule(
        entries.map((entry) => ({
          ingredientIds: this.resolveMedia(entry.item, run),
          postId: entry.postId,
          scheduledDate: target.scheduledDate ?? run.now.toISOString(),
          text: entry.caption,
        })),
        run.scope.organizationId,
        {
          credentialId: destination.credentialId,
          platform: destination.platform,
        },
        run.scope.userId,
      );
      return new Set(result.posts.map((post) => String(post.id)));
    } catch (error: unknown) {
      this.logger.error('Batch project destination failed to schedule', error, {
        batchProjectId: run.project.id,
        context: this.context,
        credentialId: destination.credentialId,
        organizationId: run.scope.organizationId,
      });
      // Part of the call may have committed; read what actually scheduled.
      return this.readScheduledPostIds(
        entries.map((entry) => entry.postId),
        destination.credentialId,
        run.scope,
      );
    }
  }

  /**
   * Pick the post this item uses on the destination and bind it before
   * scheduling: a post already bound to the destination is reused, the review
   * draft goes to the first destination, and any other destination gets its
   * own draft.
   */
  private async bindEntry(
    run: ScheduleRun,
    item: BatchProjectItem,
    destination: Destination,
  ): Promise<ScheduleEntry> {
    const caption = this.resolveCaption(item, run);
    const bindings = run.bindingsByItem.get(item.id) ?? [];
    const bound = bindings.find(
      (binding) => binding.credentialId === destination.credentialId,
    );
    const postId =
      bound?.postId ??
      (this.canUseReviewPost(run, item, bindings, destination) && item.postId
        ? item.postId
        : await this.resolveDestinationDraft(
            run,
            item,
            destination.credentialId,
            caption,
          ));
    await this.writeBindings(run, item, [
      ...bindings.filter(
        (binding) => binding.credentialId !== destination.credentialId,
      ),
      { credentialId: destination.credentialId, postId, status: 'pending' },
    ]);
    return { caption, item, postId };
  }

  /**
   * The review draft goes to the first destination only while nothing else
   * owns it: not bound to another project destination, and not already
   * targeted elsewhere (e.g. scheduled through the Post API). Otherwise the
   * destination gets its own draft rather than retargeting that schedule.
   */
  private canUseReviewPost(
    run: ScheduleRun,
    item: BatchProjectItem,
    bindings: IBatchProjectScheduledTarget[],
    destination: Destination,
  ): boolean {
    const reviewPost = item.postId
      ? run.reviewPostById.get(item.postId)
      : undefined;
    if (
      !reviewPost ||
      bindings.some((binding) => binding.postId === reviewPost.id)
    ) {
      return false;
    }
    if (reviewPost.credentialId) {
      return reviewPost.credentialId === destination.credentialId;
    }
    return reviewPost.targetExecutionState === TargetExecutionState.DRAFT;
  }

  /**
   * The media the review draft carries now (a creator may have swapped it in
   * the inbox); the generated output only when the draft has none.
   */
  private resolveMedia(item: BatchProjectItem, run: ScheduleRun): string[] {
    const reviewed = item.postId
      ? run.reviewPostById.get(item.postId)?.ingredientIds
      : undefined;
    if (reviewed && reviewed.length > 0) {
      return reviewed;
    }
    return item.outputIngredientId ? [item.outputIngredientId] : [];
  }

  private async writeBindings(
    run: ScheduleRun,
    item: BatchProjectItem,
    bindings: IBatchProjectScheduledTarget[],
  ): Promise<void> {
    run.bindingsByItem.set(item.id, bindings);
    const hasScheduled = bindings.some(
      (binding) => binding.status === 'scheduled',
    );
    await this.prisma.batchProjectItem.updateMany({
      data: {
        scheduledAt: item.scheduledAt ?? (hasScheduled ? run.now : null),
        scheduledTargets: toPrismaJson(bindings),
      },
      where: scopedWhere(run.scope.organizationId, { id: item.id }),
    });
  }

  /**
   * An explicit override wins; otherwise the review draft's current caption
   * (what the review inbox approved, including rewrites made there).
   */
  private resolveCaption(item: BatchProjectItem, run: ScheduleRun): string {
    const override = run.dto.captions?.[item.id];
    const reviewed = item.postId
      ? run.reviewPostById.get(item.postId)?.description
      : undefined;
    const caption =
      typeof override === 'string'
        ? override
        : (reviewed ??
          item.caption ??
          readBatchProjectIdea(item.idea)?.caption ??
          '');
    return caption.trim();
  }

  /** Posts that really are scheduled on the destination, approval bound. */
  private async readScheduledPostIds(
    postIds: string[],
    credentialId: string,
    scope: IBatchProjectScope,
  ): Promise<Set<string>> {
    const posts = await this.prisma.post.findMany({
      select: {
        credentialId: true,
        id: true,
        publishApprovalId: true,
        targetExecutionState: true,
      },
      where: scopedWhere(scope.organizationId, { id: { in: postIds } }),
    });
    return new Set(
      posts
        .filter(
          (post) =>
            post.credentialId === credentialId &&
            Boolean(post.publishApprovalId) &&
            SCHEDULED_EXECUTION_STATES.has(String(post.targetExecutionState)),
        )
        .map((post) => post.id),
    );
  }

  /** The one draft an item uses for one extra destination account. */
  private async resolveDestinationDraft(
    run: ScheduleRun,
    item: BatchProjectItem,
    credentialId: string,
    caption: string,
  ): Promise<string> {
    const { organizationId, userId } = run.scope;
    const targetIdempotencyKey = `${batchProjectItemSourceKey(item.id)}:${credentialId}`;
    // tenant-scope-ignore: organizationId is pinned; isDeleted is omitted so the unique key can restore a tombstone
    const existing = await this.prisma.post.findFirst({
      select: { id: true, isDeleted: true },
      where: { organizationId, targetIdempotencyKey },
    });
    if (existing) {
      if (existing.isDeleted) {
        await this.prisma.post.updateMany({
          data: { isDeleted: false },
          where: { id: existing.id, isDeleted: true, organizationId },
        });
      }
      return existing.id;
    }

    const project: BatchProject = run.project;
    const idea = readBatchProjectIdea(item.idea);
    const draft = {
      brandId: project.brandId,
      category:
        item.outputCategory === IngredientCategory.VIDEO
          ? PostCategory.VIDEO
          : PostCategory.IMAGE,
      description: caption,
      ingredients: this.resolveMedia(item, run),
      label:
        idea?.hook?.slice(0, 100) || `${project.name} #${item.position + 1}`,
      organizationId,
      sourceActionId: batchProjectItemSourceKey(item.id),
      targetExecutionState: TargetExecutionState.DRAFT,
      targetIdempotencyKey,
      userId,
      visibility: PostVisibility.PUBLIC,
    } satisfies PostCreateInput;
    const post = await this.postsService.create(draft);
    return String(post.id);
  }
}
