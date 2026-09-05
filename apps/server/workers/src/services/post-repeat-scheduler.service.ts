import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PublishApprovalsService } from '@api/index';
import {
  PostCategory,
  type PostFrequency,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildEvergreenExpansionWorkflowDefinition,
  EVERGREEN_EXPANSION_ACTION_ID,
  EVERGREEN_EXPANSION_WORKFLOW_ID,
} from '@workers/services/post-repeat-workflow-definition';
import { ReleaseRecurrenceMaterializerService } from '@workers/services/release-recurrence-materializer.service';

type CronPostChild = {
  id?: unknown;
  category?: unknown;
  description?: string;
  ingredients?: unknown[];
  label?: string;
  order?: number;
};

type ScheduleNextRepeatOptions = {
  rethrowFailures?: boolean;
};

@Injectable()
export class PostRepeatSchedulerService implements OnModuleInit {
  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly releaseRecurrenceMaterializerService: ReleaseRecurrenceMaterializerService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      EVERGREEN_EXPANSION_ACTION_ID,
      async ({ input, provenance }) => {
        const groupId = String(input.groupId ?? '');
        const organizationId = String(input.organizationId ?? '');
        if (!groupId || !organizationId) {
          throw new Error(
            'Evergreen release expansion requires groupId and organizationId',
          );
        }
        return this.releaseRecurrenceMaterializerService.materializeNext({
          groupId,
          organizationId,
          workflowExecutionId: provenance.executionId,
        });
      },
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildEvergreenExpansionWorkflowDefinition(),
    );
  }

  async scheduleNextRepeat(
    post: PostEntity,
    url: string,
    options: ScheduleNextRepeatOptions = {},
  ): Promise<void> {
    await this.materializeRecurrence(post);
    if (!post.isRepeat || !post.repeatFrequency) {
      return;
    }

    try {
      const organizationId = post.organizationId;
      const actorUserId = post.userId;
      if (!organizationId || !actorUserId) {
        throw new Error(
          'Legacy repeat requires organization and user to create publish approval.',
        );
      }
      const sourcePostId = post.id.toString();
      const occurrenceKeyPrefix = `legacy-repeat:${sourcePostId}:`;
      const existing = await this.postsService.findOne({
        isDeleted: false,
        isRepeat: true,
        organizationId,
        originalPostId: sourcePostId,
        parentId: null,
        targetIdempotencyKey: { startsWith: occurrenceKeyPrefix },
      });
      const currentCount = post.repeatCount || 0;
      const nextRepeatCount = existing
        ? Number(
            existing.targetIdempotencyKey?.slice(occurrenceKeyPrefix.length),
          )
        : currentCount + 1;
      if (!Number.isSafeInteger(nextRepeatCount) || nextRepeatCount < 1) {
        throw new Error(
          'Legacy repeat successor has an invalid occurrence identity.',
        );
      }
      // The source counter commits only after the successor and its approval
      // and children succeed. An outbox replay must acknowledge that successor.
      if (existing && currentCount >= nextRepeatCount) {
        return;
      }
      const maxRepeats = post.maxRepeats || 0;

      if (!existing && maxRepeats > 0 && nextRepeatCount >= maxRepeats) {
        await this.postsService.patch(post.id.toString(), {
          repeatCount: nextRepeatCount,
        });
        this.logger.log(`${url} maximum repeats reached`, {
          maxRepeats,
          postId: post.id,
          repeatCount: nextRepeatCount,
        });
        return;
      }

      if (
        !existing &&
        post.repeatEndDate &&
        new Date() >= new Date(post.repeatEndDate)
      ) {
        await this.postsService.patch(post.id.toString(), {
          repeatCount: nextRepeatCount,
        });
        this.logger.log(`${url} repeat end date reached`, {
          endDate: post.repeatEndDate,
          postId: post.id,
        });
        return;
      }

      const nextDate = existing?.scheduledDate
        ? new Date(existing.scheduledDate)
        : this.calculateNextScheduleDate(post);
      if (!nextDate) {
        await this.postsService.patch(post.id.toString(), {
          repeatCount: nextRepeatCount,
        });
        this.logger.warn(`${url} unable to calculate next schedule date`, {
          postId: post.id,
        });
        return;
      }

      const timezone = post.timezone;
      const occurrenceKey = `legacy-repeat:${sourcePostId}:${nextRepeatCount}`;

      const postData = {
        ...(post.agentThreadId
          ? {
              agentContextSource: post.agentContextSource,
              agentContextVersion: post.agentContextVersion,
              agentThreadId: post.agentThreadId,
            }
          : {}),
        brandId: post.brandId,
        campaignId: post.campaignId ?? undefined,
        category: (post.category as PostCategory) || PostCategory.VIDEO,
        credentialId: post.credentialId,
        description: post.description,
        ingredients: post.ingredients || [],
        isRepeat: true,
        label: post.label,
        maxRepeats: post.maxRepeats,
        organizationId,
        originalPostId: sourcePostId,
        platform: post.platform ?? undefined,
        repeatCount: nextRepeatCount,
        repeatDaysOfWeek: post.repeatDaysOfWeek,
        repeatEndDate: post.repeatEndDate,
        repeatFrequency: post.repeatFrequency as PostFrequency,
        repeatInterval: post.repeatInterval,
        scheduledDate: nextDate,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        targetIdempotencyKey: occurrenceKey,
        tags: post.tags,
        ...(timezone ? { timezone } : {}),
        userId: actorUserId,
        visibility: resolvePostVisibility(post.visibility),
      };

      const newPost =
        existing ??
        (await this.findOrCreateRepeatPost(
          organizationId,
          occurrenceKey,
          postData,
        ));
      const newPostId = newPost.id.toString();

      await this.publishApprovalsService.createForCurrentPost({
        actorUserId,
        mode: 'scheduled',
        organizationId,
        postId: newPostId,
        provenance: {
          occurrenceIndex: nextRepeatCount,
          sourcePostId,
          surface: 'legacy-repeat',
        },
      });

      const children = (post.children || []) as unknown as CronPostChild[];
      if (children.length > 0) {
        await this.cloneChildrenForRepeat(
          children,
          newPostId,
          post,
          nextDate,
          url,
          nextRepeatCount,
        );
      }

      await this.postsService.patch(post.id.toString(), {
        repeatCount: nextRepeatCount,
      });

      this.logger.log(`${url} scheduled next repeat post`, {
        childrenCloned: children.length,
        newPostId,
        nextDate,
        originalPostId: post.id,
        repeatCount: nextRepeatCount,
      });
    } catch (error: unknown) {
      this.logger.error(`${url} failed to schedule next repeat`, {
        error,
        postId: post.id,
      });
      if (options.rethrowFailures) {
        throw error;
      }
    }
  }

  private async findOrCreateRepeatPost(
    organizationId: string,
    targetIdempotencyKey: string,
    postData: PostCreateInput,
  ): Promise<Pick<PostEntity, 'id'>> {
    const existing = await this.postsService.findOne({
      isDeleted: false,
      organizationId,
      targetIdempotencyKey,
    });
    if (existing) {
      return existing;
    }

    try {
      return await this.postsService.create(postData);
    } catch (error: unknown) {
      if (!this.isUniqueConflict(error)) {
        throw error;
      }
      const concurrent = await this.postsService.findOne({
        isDeleted: false,
        organizationId,
        targetIdempotencyKey,
      });
      if (!concurrent) {
        throw error;
      }
      return concurrent;
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  async materializeRecurrence(post: PostEntity): Promise<void> {
    const groupId = post.groupId ?? undefined;
    const organizationId = post.organizationId;
    if (
      !groupId ||
      !organizationId ||
      !(await this.releaseRecurrenceMaterializerService.shouldMaterialize({
        groupId,
        organizationId,
      }))
    ) {
      return;
    }

    await this.systemWorkflowRunner.runWorkflow({
      actionType: EVERGREEN_EXPANSION_WORKFLOW_ID,
      canonicalId: EVERGREEN_EXPANSION_WORKFLOW_ID,
      inputValues: {
        groupId,
        organizationId,
        sourcePostId: post.id.toString(),
      },
      organizationId,
      source: 'PostRepeatSchedulerService.materializeRecurrence',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
      userId: post.userId,
    });
  }

  private async cloneChildrenForRepeat(
    children: CronPostChild[],
    newParentId: string,
    originalParent: PostEntity,
    newScheduledDate: Date,
    url: string,
    nextRepeatCount: number,
  ): Promise<void> {
    let firstError: unknown;
    for (const [index, child] of children.entries()) {
      try {
        const ingredientIds = (child.ingredients || [])
          .map((ingredient: unknown) =>
            ingredient && typeof ingredient === 'object' && 'id' in ingredient
              ? (ingredient as { id?: unknown }).id
              : ingredient,
          )
          .map((ingredient) => String(ingredient));

        if (!originalParent.platform) {
          continue;
        }

        const organizationId = originalParent.organizationId;
        if (!organizationId) {
          continue;
        }
        const childIdentity = String(child.id ?? child.order ?? index);
        const targetIdempotencyKey = `legacy-repeat-child:${originalParent.id}:${nextRepeatCount}:${childIdentity}`;
        await this.findOrCreateRepeatPost(
          organizationId,
          targetIdempotencyKey,
          {
            ...(originalParent.agentThreadId
              ? {
                  agentContextSource: originalParent.agentContextSource,
                  agentContextVersion: originalParent.agentContextVersion,
                  agentThreadId: originalParent.agentThreadId,
                }
              : {}),
            brandId: originalParent.brandId,
            campaignId: originalParent.campaignId ?? undefined,
            category:
              (child.category as PostCategory | undefined) || PostCategory.TEXT,
            credentialId: originalParent.credentialId,
            description: child.description || '',
            ingredients: ingredientIds,
            label: child.label || '',
            order: child.order || 0,
            originalPostId: String(child.id ?? originalParent.id),
            organizationId: originalParent.organizationId,
            parentId: newParentId,
            platform: originalParent.platform,
            scheduledDate: newScheduledDate,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            targetIdempotencyKey,
            userId: originalParent.userId,
            visibility: resolvePostVisibility(originalParent.visibility),
          },
        );
      } catch (error: unknown) {
        if (firstError === undefined) {
          firstError = error;
        }
        this.logger.error(`${url} failed to clone child for repeat`, {
          error: getErrorMessage(error, { fallback: () => undefined }),
          newParentId,
          originalChildId: String(child.id),
        });
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  }

  private calculateNextScheduleDate(post: PostEntity): Date | null {
    const currentDate = new Date(post.scheduledDate || post.nextScheduledDate);
    const interval = post.repeatInterval || 1;

    switch (post.repeatFrequency) {
      case 'daily':
        currentDate.setDate(currentDate.getDate() + interval);
        break;
      case 'weekly':
        if (post.repeatDaysOfWeek && post.repeatDaysOfWeek.length > 0) {
          return this.getNextDayOfWeek(currentDate, post.repeatDaysOfWeek);
        }
        currentDate.setDate(currentDate.getDate() + 7 * interval);
        break;
      case 'monthly':
        currentDate.setMonth(currentDate.getMonth() + interval);
        break;
      case 'yearly':
        currentDate.setFullYear(currentDate.getFullYear() + interval);
        break;
      default:
        return null;
    }

    return currentDate;
  }

  private getNextDayOfWeek(currentDate: Date, daysOfWeek: number[]): Date {
    const nextDate = new Date(currentDate);
    const currentDay = nextDate.getDay();
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const nextDayThisWeek = sortedDays.find((day) => day > currentDay);

    if (nextDayThisWeek !== undefined) {
      nextDate.setDate(nextDate.getDate() + (nextDayThisWeek - currentDay));
    } else {
      const firstDayNextWeek = sortedDays[0];
      nextDate.setDate(
        nextDate.getDate() + (7 - currentDay + firstDayNextWeek),
      );
    }

    return nextDate;
  }
}
