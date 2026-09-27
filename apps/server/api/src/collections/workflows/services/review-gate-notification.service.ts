import type { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import type { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import type { PendingReviewGateState } from '@api/collections/workflows/services/workflow-executor.types';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ChannelDestinationMessage } from '@api/services/activity-recording/activity-recording.types';
import {
  assertSafeWebhookEndpoint,
  createPinnedWebhookAgent,
} from '@api/services/webhook-client/webhook-endpoint.validator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  NotificationChannel,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { firstValueFrom } from 'rxjs';

/**
 * Context passed from the review gate at pause time. Carries the execution
 * identity the notifier needs to address reviewers and build a review link.
 */
export interface ReviewGateNotificationContext {
  executionId: string;
  workflowId: string;
  workflowLabel: string;
  organizationId: string;
  ownerUserId: string;
  brandId?: string;
}

const WEBHOOK_POST_TIMEOUT_MS = 8000;

/**
 * Records the review request and fans it out to every channel configured on
 * the node (`notifyChannels`). The request is one `WORKFLOW_REVIEW_REQUESTED`
 * activity: the alert policy puts it in the owner's bell and delivers the
 * configured email and Slack messages durably (#5197). Webhook and task-inbox
 * channels stay direct. Isolated from {@link WorkflowReviewGateService} so the
 * heavier cross-module dependencies stay out of the core gate logic. Each
 * channel is dispatched independently — one failing channel never blocks the
 * pause or the others.
 */
@Injectable()
export class ReviewGateNotificationService {
  private readonly context = 'ReviewGateNotificationService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly httpService: HttpService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * TasksService is resolved lazily via the TASKS_SERVICE token so
   * WorkflowsModule never imports TasksModule — that module edge closes 13
   * dependency cycles (module-graph baseline). Same pattern as SharedService.
   */
  private get tasksService(): TasksService {
    return this.moduleRef.get<TasksService>(TASKS_SERVICE, { strict: false });
  }

  /**
   * Dispatch pending-review notifications for the configured channels.
   * Returns the id of the created task-inbox task (if the task-inbox channel
   * was configured) so the caller can persist it for later resolution.
   */
  async dispatchPendingNotifications(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
  ): Promise<{ taskId?: string }> {
    const channels = this.normalizeChannels(pending.notifyChannels);
    try {
      await this.recordReviewRequest(pending, ctx, channels);
    } catch (error: unknown) {
      this.logger.error(
        'Review-gate request could not be recorded',
        error,
        this.context,
      );
    }

    let taskId: string | undefined;

    for (const channel of channels) {
      try {
        switch (channel) {
          case NotificationChannel.EMAIL:
          case NotificationChannel.SLACK:
            // Delivered by the recorded review request above.
            break;
          case NotificationChannel.WEBHOOK:
            await this.dispatchWebhook(pending, ctx);
            break;
          case NotificationChannel.TASK_INBOX:
            taskId = await this.dispatchTaskInbox(pending, ctx);
            break;
          default:
            this.logger.warn(
              `Unknown review-gate notify channel: ${channel}`,
              this.context,
            );
        }
      } catch (error: unknown) {
        this.logger.error(
          `Review-gate notification failed for channel ${channel}`,
          error,
          this.context,
        );
      }
    }

    return { taskId };
  }

  /**
   * Close the task-inbox task linked to a resolved review gate. Safe to call
   * with an undefined id (no-op) and never throws into the resolution path.
   */
  async resolvePendingTask(
    taskId: string | undefined,
    outcome: 'approved' | 'rejected' | 'timeout',
  ): Promise<void> {
    if (!taskId) {
      return;
    }

    const reviewState = outcome === 'approved' ? 'approved' : 'dismissed';
    try {
      await this.tasksService.patch(taskId, {
        reviewState,
        status: outcome === 'approved' ? 'done' : 'cancelled',
      });
    } catch (error: unknown) {
      this.logger.error(
        `Failed to close review-gate task ${taskId}`,
        error,
        this.context,
      );
    }
  }

  private async recordReviewRequest(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
    channels: string[],
  ): Promise<void> {
    const destinations: ChannelDestinationMessage[] = [];
    if (channels.includes(NotificationChannel.EMAIL)) {
      const to = pending.notifyEmail || (await this.resolveOwnerEmail(ctx));
      if (to) {
        destinations.push({
          destination: to,
          message: {
            action: 'review_gate_pending',
            payload: {
              captionPreview: pending.inputCaption ?? undefined,
              executionId: ctx.executionId,
              nodeId: pending.nodeId,
              organizationId: ctx.organizationId,
              to,
              userId: ctx.ownerUserId,
              workflowId: ctx.workflowId,
              workflowLabel: ctx.workflowLabel,
            },
            type: 'email',
          },
        });
      } else {
        this.logger.warn(
          'Review-gate email skipped — no reviewer email resolved',
          this.context,
        );
      }
    }
    const slackChannel = channels.includes(NotificationChannel.SLACK)
      ? pending.slackChannel?.trim()
      : undefined;
    if (slackChannel) {
      destinations.push({
        destination: slackChannel,
        message: {
          action: 'send_message',
          payload: {
            chatId: slackChannel,
            message: `:eyes: Review needed for *${ctx.workflowLabel}* — a workflow step is awaiting approval.${
              pending.inputCaption ? `\n> ${pending.inputCaption}` : ''
            }`,
          },
          type: 'slack',
        },
      });
    } else if (channels.includes(NotificationChannel.SLACK)) {
      this.logger.warn(
        'Review-gate slack skipped — no channel configured',
        this.context,
      );
    }

    await this.activityRecorder.record({
      alert: {
        deduplicationKey: `${ActivityKey.WORKFLOW_REVIEW_REQUESTED}/${ctx.executionId}/${pending.nodeId}`,
        destinations,
        source: { id: ctx.executionId, type: 'workflow_execution' },
      },
      brandId: ctx.brandId ?? null,
      data: { nodeId: pending.nodeId, workflowId: ctx.workflowId },
      entityId: ctx.executionId,
      entityModel: 'WorkflowExecution',
      key: ActivityKey.WORKFLOW_REVIEW_REQUESTED,
      organizationId: ctx.organizationId,
      source: ActivitySource.WORKFLOW_EXECUTION,
      userId: ctx.ownerUserId,
      value: ctx.workflowLabel,
    });
  }

  private async dispatchWebhook(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
  ): Promise<void> {
    const url = pending.webhookUrl?.trim();
    if (!url) {
      this.logger.warn(
        'Review-gate webhook skipped — no URL configured',
        this.context,
      );
      return;
    }

    // SSRF guard: reject private/loopback/link-local targets before any request.
    const validatedEndpoint = await assertSafeWebhookEndpoint(url);
    const pinnedAgent = createPinnedWebhookAgent(validatedEndpoint);
    const pinnedAgentConfig =
      validatedEndpoint.url.protocol === 'https:'
        ? { httpsAgent: pinnedAgent }
        : { httpAgent: pinnedAgent };

    await firstValueFrom(
      this.httpService.post(
        url,
        {
          event: 'review_gate.pending',
          executionId: ctx.executionId,
          inputCaption: pending.inputCaption,
          inputMedia: pending.inputMedia,
          nodeId: pending.nodeId,
          organizationId: ctx.organizationId,
          requestedAt: pending.requestedAt,
          workflowId: ctx.workflowId,
          workflowLabel: ctx.workflowLabel,
        },
        {
          headers: { Host: validatedEndpoint.url.host },
          ...pinnedAgentConfig,
          maxRedirects: 0,
          timeout: WEBHOOK_POST_TIMEOUT_MS,
        },
      ),
    );
  }

  private async dispatchTaskInbox(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
  ): Promise<string | undefined> {
    const title = `Review: ${ctx.workflowLabel}`;
    const description = pending.inputCaption
      ? `A workflow step is awaiting approval.\n\n${pending.inputCaption}`
      : 'A workflow step is awaiting approval.';

    const created = await this.tasksService.create({
      // config is a real Task column — store execution linkage for traceability.
      config: {
        nodeId: pending.nodeId,
        source: 'review-gate',
        workflowExecutionId: ctx.executionId,
        workflowId: ctx.workflowId,
      },
      description,
      organizationId: ctx.organizationId,
      reviewState: 'pending_approval',
      status: 'in_review',
      title,
      userId: ctx.ownerUserId,
      ...(ctx.brandId ? { brandId: ctx.brandId } : {}),
    } as CreateTaskDto & Record<string, unknown>);

    return created.id;
  }

  private async resolveOwnerEmail(
    ctx: ReviewGateNotificationContext,
  ): Promise<string | null> {
    if (!ctx.ownerUserId) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      select: { email: true },
      where: { id: ctx.ownerUserId },
    });
    return user?.email ?? null;
  }

  private normalizeChannels(channels: string[] | undefined): string[] {
    if (!Array.isArray(channels)) {
      return [];
    }
    // De-duplicate and drop empties; values are matched case-sensitively
    // against NotificationChannel (email / webhook / slack / task-inbox).
    return [...new Set(channels.filter((channel) => Boolean(channel)))];
  }
}
