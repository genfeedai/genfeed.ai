import type { CreateTaskDto } from '@api/collections/tasks/dto/create-task.dto';
import type { TasksService } from '@api/collections/tasks/services/tasks.service';
import { TASKS_SERVICE } from '@api/collections/tasks/tasks.tokens';
import type { PendingReviewGateState } from '@api/collections/workflows/services/workflow-executor.types';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { assertSafeWebhookEndpoint } from '@api/services/webhook-client/webhook-endpoint.validator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { NotificationChannel } from '@genfeedai/enums';
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
 * Fans a pending review-gate notification out to every channel configured on
 * the node (`notifyChannels`). Isolated from {@link WorkflowReviewGateService}
 * so the heavier cross-module dependencies (tasks, notifications transport,
 * outbound HTTP) stay out of the core gate logic. Each channel is dispatched
 * independently — one failing channel never blocks the pause or the others.
 */
@Injectable()
export class ReviewGateNotificationService {
  private readonly context = 'ReviewGateNotificationService';

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
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
    if (channels.length === 0) {
      return {};
    }

    let taskId: string | undefined;

    for (const channel of channels) {
      try {
        switch (channel) {
          case NotificationChannel.EMAIL:
            await this.dispatchEmail(pending, ctx);
            break;
          case NotificationChannel.SLACK:
            await this.dispatchSlack(pending, ctx);
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

  private async dispatchEmail(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
  ): Promise<void> {
    const to = pending.notifyEmail || (await this.resolveOwnerEmail(ctx));
    if (!to) {
      this.logger.warn(
        'Review-gate email skipped — no reviewer email resolved',
        this.context,
      );
      return;
    }

    await this.notificationsService.sendReviewGatePendingEmail({
      captionPreview: pending.inputCaption ?? undefined,
      executionId: ctx.executionId,
      nodeId: pending.nodeId,
      organizationId: ctx.organizationId,
      to,
      userId: ctx.ownerUserId,
      workflowId: ctx.workflowId,
      workflowLabel: ctx.workflowLabel,
    });
  }

  private async dispatchSlack(
    pending: PendingReviewGateState,
    ctx: ReviewGateNotificationContext,
  ): Promise<void> {
    const channel = pending.slackChannel?.trim();
    if (!channel) {
      this.logger.warn(
        'Review-gate slack skipped — no channel configured',
        this.context,
      );
      return;
    }

    const message = `:eyes: Review needed for *${ctx.workflowLabel}* — a workflow step is awaiting approval.${
      pending.inputCaption ? `\n> ${pending.inputCaption}` : ''
    }`;

    await this.notificationsService.sendReviewGatePendingSlack(
      channel,
      message,
    );
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
    await assertSafeWebhookEndpoint(url);

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
        { timeout: WEBHOOK_POST_TIMEOUT_MS },
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

    return (
      (created as { id?: string; _id?: string })?.id ??
      (created as { _id?: string })?._id
    );
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
