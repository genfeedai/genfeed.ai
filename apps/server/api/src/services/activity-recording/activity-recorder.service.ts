import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '@api/services/activity-recording/activity-recorded.event';
import {
  dispatchChannelMessagesInTransaction,
  mergeCommits,
  type RecordingClient,
  recordActivityInTransaction,
  updateActivityInTransaction,
} from '@api/services/activity-recording/activity-recording.core';
import type {
  ActivityRef,
  ChannelDispatchInput,
  RecordActivityInput,
  RecordedActivity,
  RecordingCommit,
  UpdateActivityInput,
} from '@api/services/activity-recording/activity-recording.types';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * The one recording API (#5197). A producer records a user-facing event once,
 * as an Activity. When the activity key is in the alert policy map
 * (`ACTIVITY_ALERT_POLICIES`), the notification event and its deliveries are
 * written in the same transaction and linked to the activity. Transport-only
 * messages that are not activities (operator and explicit channel sends) go
 * through {@link dispatch}. `check:architecture` fails on an activity or
 * outbox write anywhere else.
 */
@Injectable()
export class ActivityRecorderService {
  private readonly context = { service: ActivityRecorderService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: WorkflowNotificationQueueService,
    private readonly publisher: NotificationsPublisherService,
    private readonly logger: LoggerService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** Record one activity and raise its alert, then run the commit effects. */
  async record(input: RecordActivityInput): Promise<ActivityDocument> {
    const recorded = await this.prisma.$transaction((transaction) =>
      this.recordInTransaction(transaction, input),
    );
    await this.afterCommit(recorded.commit);
    return recorded.activity;
  }

  /** Record several activities atomically. */
  async recordMany(
    inputs: readonly RecordActivityInput[],
  ): Promise<ActivityDocument[]> {
    if (inputs.length === 0) return [];
    const commit = await this.prisma.$transaction(async (transaction) => {
      const commits: RecordingCommit[] = [];
      for (const input of inputs) {
        commits.push(
          (await this.recordInTransaction(transaction, input)).commit,
        );
      }
      return mergeCommits(commits);
    });
    await this.afterCommit(commit);
    return commit.activities;
  }

  /**
   * Record inside the caller's transaction. The caller passes the returned
   * `commit` to {@link afterCommit} once its transaction has committed.
   */
  recordInTransaction(
    transaction: RecordingClient,
    input: RecordActivityInput,
  ): Promise<RecordedActivity> {
    return recordActivityInTransaction(transaction, input, this.logger);
  }

  /**
   * Update an activity (for example processing → failed). When the key
   * changes to one in the alert policy map, the alert is raised atomically.
   */
  async update(
    ref: ActivityRef,
    input: UpdateActivityInput,
  ): Promise<ActivityDocument | null> {
    const recorded = await this.prisma.$transaction((transaction) =>
      this.updateInTransaction(transaction, ref, input),
    );
    if (!recorded) return null;
    await this.afterCommit(recorded.commit);
    return recorded.activity;
  }

  updateInTransaction(
    transaction: RecordingClient,
    ref: ActivityRef,
    input: UpdateActivityInput,
  ): Promise<RecordedActivity | null> {
    return updateActivityInTransaction(transaction, ref, input, this.logger);
  }

  /**
   * Send transport messages that are not activities: operator alerts (for
   * example a new signup or revenue in the operator Discord) and explicit
   * sends (an invitation email, a workflow node's Telegram message). They get
   * the outbox's atomicity, deduplication and retry.
   */
  async dispatch(input: ChannelDispatchInput): Promise<void> {
    const commit = await this.prisma.$transaction((transaction) =>
      this.dispatchInTransaction(transaction, input),
    );
    await this.afterCommit(commit);
  }

  dispatchInTransaction(
    transaction: RecordingClient,
    input: ChannelDispatchInput,
  ): Promise<RecordingCommit> {
    return dispatchChannelMessagesInTransaction(transaction, input);
  }

  /**
   * Post-commit effects: wake the delivery worker, refresh the bell of every
   * in-app recipient and announce the new activities (streaks listen).
   * Failures are logged, never thrown: the durable rows are already committed
   * and the worker recovery sweep re-enqueues any pending delivery.
   */
  async afterCommit(commit: RecordingCommit): Promise<void> {
    await Promise.all(
      commit.pendingDeliveryIds.map(async (deliveryId) => {
        try {
          await this.queue.enqueue(deliveryId);
        } catch (error: unknown) {
          this.logger.error(
            'Durable notification queue publish failed',
            error,
            {
              ...this.context,
              deliveryId,
            },
          );
        }
      }),
    );

    for (const entry of commit.inbox) {
      try {
        await this.publisher.publishInboxUpdate(
          entry.organizationId,
          entry.userIds,
        );
      } catch (error: unknown) {
        this.logger.warn('Notification inbox refresh publish failed', {
          ...this.context,
          error,
          organizationId: entry.organizationId,
        });
      }
    }

    if (commit.activities.length > 0 && this.events) {
      const event: ActivityRecordedEvent = {
        activities: commit.activities.map((activity) => ({
          createdAt: activity.createdAt ?? new Date(),
          id: activity.id,
          key: typeof activity.key === 'string' ? activity.key : null,
          organizationId: activity.organizationId,
          userId: activity.userId,
        })),
      };
      try {
        await this.events.emitAsync(ACTIVITY_RECORDED_EVENT, event);
      } catch (error: unknown) {
        this.logger.warn('Activity recorded listeners failed', {
          ...this.context,
          error,
        });
      }
    }
  }
}
