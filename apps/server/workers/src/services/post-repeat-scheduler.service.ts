import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
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
          error: getErrorMessage(error, { fallback: () => undefined }),
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
