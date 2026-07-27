import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import {
  PostCategory,
  type PostFrequency,
  PostStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
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

      const postData = {
        ...(post.agentThreadId
          ? {
              agentContextSource: post.agentContextSource,
              agentContextVersion: post.agentContextVersion,
              agentThreadId: post.agentThreadId,
            }
          : {}),
        brand: this.readPostString(post, ['brandId', 'brand']) ?? '',
        category: (post.category as PostCategory) || PostCategory.VIDEO,
        credential:
          this.readPostString(post, ['credentialId', 'credential']) ?? '',
        description: post.description,
        ingredients: post.ingredients || [],
        isRepeat: true,
        label: post.label,
        maxRepeats: post.maxRepeats,
        organization:
          this.readPostString(post, ['organizationId', 'organization']) ?? '',
        platform: post.platform,
        repeatCount: nextRepeatCount,
        repeatDaysOfWeek: post.repeatDaysOfWeek,
        repeatEndDate: post.repeatEndDate,
        repeatFrequency: post.repeatFrequency as PostFrequency,
        repeatInterval: post.repeatInterval,
        scheduledDate: nextDate,
        status: PostStatus.SCHEDULED,
        tags: post.tags,
        user: this.readPostString(post, ['userId', 'user']) ?? '',
      };

      const newPost = await this.postsService.create(postData);

      const children = (post.children || []) as unknown as CronPostChild[];
      if (children.length > 0) {
        await this.cloneChildrenForRepeat(
          children,
          newPost.id.toString(),
          post,
          nextDate,
          url,
        );
      }

      this.logger.log(`${url} scheduled next repeat post`, {
        childrenCloned: children.length,
        newPostId: newPost.id,
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
    const groupId = this.readPostString(post, ['groupId']);
    const organizationId = this.readPostString(post, [
      'organizationId',
      'organization',
    ]);
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
        userId: this.readPostString(post, ['userId', 'user']),
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

        await this.postsService.create({
          ...(originalParent.agentThreadId
            ? {
                agentContextSource: originalParent.agentContextSource,
                agentContextVersion: originalParent.agentContextVersion,
                agentThreadId: originalParent.agentThreadId,
              }
            : {}),
          brand:
            this.readPostString(originalParent, ['brandId', 'brand']) ?? '',
          category:
            (child.category as PostCategory | undefined) || PostCategory.TEXT,
          credential:
            this.readPostString(originalParent, [
              'credentialId',
              'credential',
            ]) ?? '',
          description: child.description || '',
          ingredients: ingredientIds,
          label: child.label || '',
          order: child.order || 0,
          organization:
            this.readPostString(originalParent, [
              'organizationId',
              'organization',
            ]) ?? '',
          parent: newParentId,
          platform: originalParent.platform as never,
          scheduledDate: newScheduledDate,
          status: PostStatus.SCHEDULED,
          user: this.readPostString(originalParent, ['userId', 'user']) ?? '',
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

  private readPostString(
    post: PostEntity,
    keys: readonly string[],
  ): string | undefined {
    const record = post as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id?: unknown }).id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }

    return undefined;
  }
}
