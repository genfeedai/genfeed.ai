import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { resolvePostVisibility } from '@api-types/contracts/scheduler.contract';
import {
  PostCategory,
  type PostFrequency,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { PublishApprovalsService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ReleaseRecurrenceMaterializerService } from '@workers/services/release-recurrence-materializer.service';

type CronPostChild = {
  id?: unknown;
  category?: unknown;
  description?: string;
  ingredients?: unknown[];
  label?: string;
  order?: number;
};

@Injectable()
export class PostRepeatSchedulerService {
  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly releaseRecurrenceMaterializerService: ReleaseRecurrenceMaterializerService,
  ) {}

  async scheduleNextRepeat(post: PostEntity, url: string): Promise<void> {
    await this.materializeRecurrence(post);
    if (!post.isRepeat || !post.repeatFrequency) {
      return;
    }

    try {
      const currentCount = post.repeatCount || 0;
      const nextRepeatCount = currentCount + 1;
      const maxRepeats = post.maxRepeats || 0;

      await this.postsService.patch(post.id.toString(), {
        repeatCount: nextRepeatCount,
      });

      if (maxRepeats > 0 && nextRepeatCount >= maxRepeats) {
        this.logger.log(`${url} maximum repeats reached`, {
          maxRepeats,
          postId: post.id,
          repeatCount: nextRepeatCount,
        });
        return;
      }

      if (post.repeatEndDate && new Date() >= new Date(post.repeatEndDate)) {
        this.logger.log(`${url} repeat end date reached`, {
          endDate: post.repeatEndDate,
          postId: post.id,
        });
        return;
      }

      const nextDate = this.calculateNextScheduleDate(post);
      if (!nextDate) {
        this.logger.warn(`${url} unable to calculate next schedule date`, {
          postId: post.id,
        });
        return;
      }

      const organizationId = post.organizationId;
      const actorUserId = post.userId;
      // Occurrence #2+ must carry a version-bound PublishApproval so the
      // scheduled sweep can enqueue approvalId + operationId + versionPinId.
      // Without this, cron.posts.service terminal-fails non-retryably.
      if (!organizationId || !actorUserId) {
        throw new Error(
          'Legacy repeat requires organization and user to create publish approval.',
        );
      }
      const timezone = post.timezone;

      const postData = {
        ...(post.agentThreadId
          ? {
              agentContextSource: post.agentContextSource,
              agentContextVersion: post.agentContextVersion,
              agentThreadId: post.agentThreadId,
            }
          : {}),
        brandId: post.brandId,
        category: (post.category as PostCategory) || PostCategory.VIDEO,
        credentialId: post.credentialId,
        description: post.description,
        ingredients: post.ingredients || [],
        isRepeat: true,
        label: post.label,
        maxRepeats: post.maxRepeats,
        organizationId,
        platform: post.platform ?? undefined,
        repeatCount: nextRepeatCount,
        repeatDaysOfWeek: post.repeatDaysOfWeek,
        repeatEndDate: post.repeatEndDate,
        repeatFrequency: post.repeatFrequency as PostFrequency,
        repeatInterval: post.repeatInterval,
        scheduledDate: nextDate,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        tags: post.tags,
        ...(timezone ? { timezone } : {}),
        userId: actorUserId,
        visibility: resolvePostVisibility(post.visibility),
      };

      const newPost = await this.postsService.create(postData);
      const newPostId = newPost.id.toString();

      await this.publishApprovalsService.createForCurrentPost({
        actorUserId,
        mode: 'scheduled',
        organizationId,
        postId: newPostId,
        provenance: {
          occurrenceIndex: nextRepeatCount,
          sourcePostId: post.id.toString(),
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
        );
      }

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
    }
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

    await this.systemWorkflowProvenanceService.runAction(
      {
        actionType: 'expand-evergreen-release',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.EVERGREEN_RELEASE_EXPANSION,
        description:
          'Materializes the next bounded occurrence of a terminal evergreen release.',
        inputValues: {
          groupId,
          sourcePostId: post.id.toString(),
        },
        label: 'Evergreen Release Expansion',
        organizationId,
        source: 'PostRepeatSchedulerService.materializeRecurrence',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: post.userId,
      },
      (provenance) =>
        this.releaseRecurrenceMaterializerService.materializeNext({
          groupId,
          organizationId,
          workflowExecutionId: provenance.executionId,
        }),
    );
  }

  private async cloneChildrenForRepeat(
    children: CronPostChild[],
    newParentId: string,
    originalParent: PostEntity,
    newScheduledDate: Date,
    url: string,
  ): Promise<void> {
    for (const child of children) {
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

        await this.postsService.create({
          ...(originalParent.agentThreadId
            ? {
                agentContextSource: originalParent.agentContextSource,
                agentContextVersion: originalParent.agentContextVersion,
                agentThreadId: originalParent.agentThreadId,
              }
            : {}),
          brandId: originalParent.brandId,
          category:
            (child.category as PostCategory | undefined) || PostCategory.TEXT,
          credentialId: originalParent.credentialId,
          description: child.description || '',
          ingredients: ingredientIds,
          label: child.label || '',
          order: child.order || 0,
          organizationId: originalParent.organizationId,
          parentId: newParentId,
          platform: originalParent.platform,
          scheduledDate: newScheduledDate,
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: originalParent.userId,
          visibility: resolvePostVisibility(originalParent.visibility),
        });
      } catch (error: unknown) {
        this.logger.error(`${url} failed to clone child for repeat`, {
          error: (error as Error)?.message,
          newParentId,
          originalChildId: String(child.id),
        });
      }
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
