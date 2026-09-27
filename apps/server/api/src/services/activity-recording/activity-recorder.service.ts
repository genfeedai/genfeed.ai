import { createHash } from 'node:crypto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  buildActivityMutation,
  normalizeActivityDocument,
} from '@api/collections/activities/utils/activity-document.util';
import {
  ACTIVITY_RECORDED_EVENT,
  type ActivityRecordedEvent,
} from '@api/services/activity-recording/activity-recorded.event';
import type {
  ActivityAlertOptions,
  ActivityRef,
  ChannelDispatchInput,
  RecordActivityInput,
  RecordedActivity,
  RecordingCommit,
  UpdateActivityInput,
} from '@api/services/activity-recording/activity-recording.types';
import {
  findOutboxEvent,
  type OutboxDeliveryInput,
  writeNotificationOutbox,
} from '@api/services/activity-recording/notification-outbox.writer';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type ActivityAlertPolicy,
  type AlertChannel,
  defaultInAppNotificationPreference,
  getActivityAlertPolicy,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

type RecordingClient = Prisma.TransactionClient;

const IN_APP_PROVIDER = 'inbox';
const EMAIL_PROVIDER = 'resend';
const CHANNEL_MESSAGE_PROVIDER = 'notifications';

function emptyCommit(activities: ActivityDocument[] = []): RecordingCommit {
  return { activities, inbox: [], pendingDeliveryIds: [] };
}

function mergeCommits(commits: readonly RecordingCommit[]): RecordingCommit {
  const inbox = new Map<string, Set<string>>();
  for (const commit of commits) {
    for (const entry of commit.inbox) {
      const users = inbox.get(entry.organizationId) ?? new Set<string>();
      for (const userId of entry.userIds) users.add(userId);
      inbox.set(entry.organizationId, users);
    }
  }
  return {
    activities: commits.flatMap((commit) => commit.activities),
    inbox: [...inbox].map(([organizationId, users]) => ({
      organizationId,
      userIds: [...users],
    })),
    pendingDeliveryIds: [
      ...new Set(commits.flatMap((commit) => commit.pendingDeliveryIds)),
    ],
  };
}

/** Destinations may be email addresses; keep them out of idempotency keys. */
function destinationToken(destination: string | null): string {
  return destination
    ? createHash('sha256').update(destination).digest('hex').slice(0, 24)
    : 'operator';
}

/**
 * The one recording API (#5197). A producer records a user-facing event once,
 * as an Activity. When the activity key is in the alert policy map
 * (`ACTIVITY_ALERT_POLICIES`), the notification event and its deliveries are
 * written in the same transaction and linked to the activity. Transport-only
 * messages that are not activities (operator and explicit channel sends) go
 * through {@link dispatch}. Nothing else writes activities or the outbox.
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
   * Record inside the caller's transaction. The caller must pass the returned
   * `commit` to {@link afterCommit} once its transaction has committed.
   */
  async recordInTransaction(
    transaction: RecordingClient,
    input: RecordActivityInput,
  ): Promise<RecordedActivity> {
    const policy = getActivityAlertPolicy(input.key);
    if (input.id) {
      // A deterministic id is the producer's idempotency key.
      const existing = await this.findActivity(
        transaction,
        input.organizationId,
        input.id,
      );
      if (existing) {
        return { activity: existing, commit: emptyCommit() };
      }
    }
    const deduplicationKey = input.alert?.deduplicationKey;
    if (policy && deduplicationKey) {
      const existing = await this.findExistingActivity(
        transaction,
        input.organizationId,
        deduplicationKey,
      );
      if (existing) {
        return { activity: existing, commit: emptyCommit() };
      }
    }

    const row = await transaction.activity.create({
      data: buildActivityMutation({
        brandId: input.brandId,
        data: input.data,
        entityId: input.entityId,
        entityModel: input.entityModel,
        id: input.id,
        isRead: input.isRead,
        key: input.key,
        organizationId: input.organizationId,
        source: input.source,
        userId: input.userId,
        value: input.value,
      }),
    });
    const activity = normalizeActivityDocument(row as ActivityDocument);
    const commit = emptyCommit([activity]);
    if (!policy) {
      return { activity, commit };
    }
    const alert = await this.raiseAlert(
      transaction,
      activity,
      input.key,
      policy,
      input.alert,
    );
    return { activity, commit: mergeCommits([commit, alert]) };
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

  async updateInTransaction(
    transaction: RecordingClient,
    ref: ActivityRef,
    input: UpdateActivityInput,
  ): Promise<RecordedActivity | null> {
    const existing = ref.organizationId
      ? await transaction.activity.findFirst({
          where: scopedWhere(ref.organizationId, { id: ref.id }),
        })
      : await transaction.activity.findFirst({
          where: { id: ref.id, isDeleted: false, organizationId: null },
        });
    if (!existing) return null;

    const mutation = buildActivityMutation(
      {
        brandId: input.brandId,
        data: input.data,
        entityId: input.entityId,
        entityModel: input.entityModel,
        isRead: input.isRead,
        key: input.key,
        source: input.source,
        userId: input.userId,
        value: input.value,
      },
      existing as ActivityDocument,
    );
    const row = await transaction.activity.update({
      data: {
        action: mutation.action,
        brandId: mutation.brandId,
        data: mutation.data,
        entityId: mutation.entityId,
        entityModel: mutation.entityModel,
        userId: mutation.userId,
      },
      where: {
        id: existing.id,
        isDeleted: false,
        organizationId: existing.organizationId,
      },
    });
    const activity = normalizeActivityDocument(row as ActivityDocument);
    const commit = emptyCommit([]);
    const policy =
      input.key && input.key !== existing.action
        ? getActivityAlertPolicy(input.key)
        : null;
    if (!policy || !input.key) {
      return { activity, commit };
    }
    const alert = await this.raiseAlert(
      transaction,
      activity,
      input.key,
      policy,
      input.alert,
    );
    return { activity, commit: mergeCommits([commit, alert]) };
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

  async dispatchInTransaction(
    transaction: RecordingClient,
    input: ChannelDispatchInput,
  ): Promise<RecordingCommit> {
    const [first] = input.messages;
    if (!first) return emptyCommit();
    const result = await writeNotificationOutbox(
      transaction,
      {
        actorUserId: input.actorUserId ?? null,
        deduplicationKey: input.deduplicationKey,
        eventKey: `message.${first.message.type}.${first.message.action}`,
        occurredAt: input.occurredAt ?? new Date(),
        organizationId: input.organizationId,
        payload: { kind: 'channel_message', version: 1 },
        sourceId: input.source.id,
        sourceType: input.source.type,
      },
      input.messages.map((entry) => ({
        channel: entry.message.type,
        destination: entry.destination,
        idempotencyKey: `${input.deduplicationKey}/${entry.message.type}/${destinationToken(entry.destination)}`,
        message: entry.message,
        provider: CHANNEL_MESSAGE_PROVIDER,
        topic: input.topic,
      })),
    );
    return { ...emptyCommit(), pendingDeliveryIds: result.pendingDeliveryIds };
  }

  /**
   * Post-commit effects: wake the delivery worker, refresh the bell of every
   * in-app recipient and announce the new activities (streaks listen).
   * Failures are logged, never thrown:
   * the durable rows are already committed and the worker recovery sweep
   * re-enqueues any pending delivery.
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

  private async findExistingActivity(
    transaction: RecordingClient,
    organizationId: string | null,
    deduplicationKey: string,
  ): Promise<ActivityDocument | null> {
    const event = await findOutboxEvent(
      transaction,
      organizationId,
      deduplicationKey,
    );
    return event?.activityId
      ? this.findActivity(transaction, organizationId, event.activityId)
      : null;
  }

  private async findActivity(
    transaction: RecordingClient,
    organizationId: string | null,
    activityId: string,
  ): Promise<ActivityDocument | null> {
    const row = organizationId
      ? await transaction.activity.findFirst({
          where: scopedWhere(organizationId, { id: activityId }),
        })
      : await transaction.activity.findFirst({
          where: { id: activityId, isDeleted: false, organizationId: null },
        });
    return row ? normalizeActivityDocument(row as ActivityDocument) : null;
  }

  private async raiseAlert(
    transaction: RecordingClient,
    activity: ActivityDocument,
    key: string,
    policy: ActivityAlertPolicy,
    alert: ActivityAlertOptions | undefined,
  ): Promise<RecordingCommit> {
    const organizationId = activity.organizationId;
    const deduplicationKey = alert?.deduplicationKey ?? `${key}/${activity.id}`;
    const occurredAt = alert?.occurredAt ?? activity.createdAt ?? new Date();
    const narrow = (channels: readonly AlertChannel[]): AlertChannel[] =>
      alert?.channels
        ? channels.filter((channel) => alert.channels?.includes(channel))
        : [...channels];

    const deliveries = new Map<string, OutboxDeliveryInput>();
    const add = (delivery: OutboxDeliveryInput): void => {
      deliveries.set(delivery.idempotencyKey, delivery);
    };

    for (const route of policy.recipients) {
      const channels = narrow(route.channels);
      if (channels.length === 0) continue;

      if (route.recipient === 'operator') {
        for (const channel of channels) {
          if (channel === 'in_app') continue;
          const message = alert?.operatorMessages?.[channel];
          if (!message) {
            this.logger.warn('Operator alert has no rendered message', {
              ...this.context,
              channel,
              key,
            });
            continue;
          }
          add({
            channel,
            destination: null,
            idempotencyKey: `${deduplicationKey}/operator/${channel}`,
            message,
            provider: CHANNEL_MESSAGE_PROVIDER,
            topic: policy.topic,
          });
        }
        continue;
      }

      if (route.recipient === 'explicit') {
        for (const entry of alert?.destinations ?? []) {
          if (!channels.includes(entry.message.type)) continue;
          add({
            channel: entry.message.type,
            destination: entry.destination,
            idempotencyKey: `${deduplicationKey}/${entry.message.type}/${destinationToken(entry.destination)}`,
            message: entry.message,
            provider: CHANNEL_MESSAGE_PROVIDER,
            topic: policy.topic,
          });
        }
        continue;
      }

      if (!organizationId) continue;
      const userId =
        route.recipient === 'actor'
          ? activity.userId
          : await this.findOrganizationOwner(transaction, organizationId);
      if (
        !userId ||
        !(await this.isActiveMember(transaction, organizationId, userId))
      ) {
        continue;
      }

      for (const channel of channels) {
        const idempotencyKey = `${deduplicationKey}/${userId}/${channel}`;
        if (channel === 'in_app') {
          if (await this.isInAppDisabled(transaction, userId, policy.topic)) {
            continue;
          }
          add({
            channel,
            idempotencyKey,
            isDelivered: true,
            provider: IN_APP_PROVIDER,
            topic: policy.topic,
            userId,
          });
        } else if (channel === 'email') {
          add({
            channel,
            idempotencyKey,
            provider: EMAIL_PROVIDER,
            topic: policy.topic,
            userId,
          });
        } else if (channel === 'telegram' || channel === 'discord') {
          add({
            channel,
            idempotencyKey,
            provider: channel,
            topic: policy.topic,
            userId,
          });
        }
      }
    }

    const result = await writeNotificationOutbox(
      transaction,
      {
        activityId: activity.id,
        actorUserId: alert?.actorUserId ?? activity.actorUserId ?? null,
        deduplicationKey,
        eventKey: key,
        occurredAt,
        organizationId,
        payload: (alert?.payload ?? {
          kind: 'activity',
          version: 1,
        }) as Prisma.InputJsonObject,
        sourceId: alert?.source?.id ?? activity.id,
        sourceType: alert?.source?.type ?? 'activity',
      },
      [...deliveries.values()],
    );
    return {
      activities: [],
      inbox:
        organizationId && result.inboxUserIds.length > 0
          ? [{ organizationId, userIds: result.inboxUserIds }]
          : [],
      pendingDeliveryIds: result.pendingDeliveryIds,
    };
  }

  private async findOrganizationOwner(
    transaction: RecordingClient,
    organizationId: string,
  ): Promise<string | null> {
    const organization = await transaction.organization.findFirst({
      select: { userId: true },
      where: { id: organizationId, isDeleted: false },
    });
    return organization?.userId ?? null;
  }

  private async isActiveMember(
    transaction: RecordingClient,
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await transaction.member.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        isActive: true,
        user: { is: { isDeleted: false } },
        userId,
      }),
    });
    return Boolean(member);
  }

  private async isInAppDisabled(
    transaction: RecordingClient,
    userId: string,
    topic: string,
  ): Promise<boolean> {
    const preference = await transaction.notificationPreference.findFirst({
      select: { isEnabled: true },
      where: { channel: 'in_app', isDeleted: false, topic, userId },
    });
    return !(
      preference?.isEnabled ?? defaultInAppNotificationPreference(topic)
    );
  }
}
