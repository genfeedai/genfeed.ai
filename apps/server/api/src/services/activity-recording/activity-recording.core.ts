import { createHash } from 'node:crypto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  buildActivityMutation,
  normalizeActivityDocument,
} from '@api/collections/activities/utils/activity-document.util';
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
  runForEventOrganization,
  writeNotificationOutbox,
} from '@api/services/activity-recording/notification-outbox.writer';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type ActivityAlertPolicy,
  type AlertChannel,
  defaultInAppNotificationPreference,
  getActivityAlertPolicy,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';

/**
 * Transaction-scoped core of the recording API (#5197). Every write here runs
 * on the caller's transaction client, so an activity, its notification event
 * and its deliveries commit or roll back together. `ActivityRecorderService`
 * wraps these with their own transaction and the post-commit effects.
 */

/** The delegates recording touches, so any transaction client satisfies it. */
export type RecordingClient = Pick<
  Prisma.TransactionClient,
  | 'activity'
  | 'member'
  | 'notificationDelivery'
  | 'notificationEvent'
  | 'notificationPreference'
  | 'organization'
>;

export interface RecordingLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

const IN_APP_PROVIDER = 'inbox';
const EMAIL_PROVIDER = 'resend';
const CHANNEL_MESSAGE_PROVIDER = 'notifications';

export function emptyCommit(
  activities: ActivityDocument[] = [],
): RecordingCommit {
  return { activities, inbox: [], pendingDeliveryIds: [] };
}

export function mergeCommits(
  commits: readonly RecordingCommit[],
): RecordingCommit {
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

async function findActivity(
  transaction: RecordingClient,
  organizationId: string | null,
  activityId: string,
): Promise<ActivityDocument | null> {
  const row = organizationId
    ? await transaction.activity.findFirst({
        where: scopedWhere(organizationId, { id: activityId }),
      })
    : await runForEventOrganization(organizationId, () =>
        transaction.activity.findFirst({
          where: { id: activityId, isDeleted: false, organizationId: null },
        }),
      );
  return row ? normalizeActivityDocument(row as ActivityDocument) : null;
}

/**
 * Record an activity inside the caller's transaction and raise the alert the
 * policy map assigns to its key. Pass the returned `commit` to
 * `ActivityRecorderService.afterCommit` once the transaction commits.
 */
export async function recordActivityInTransaction(
  transaction: RecordingClient,
  input: RecordActivityInput,
  logger?: RecordingLogger,
): Promise<RecordedActivity> {
  const policy = getActivityAlertPolicy(input.key);
  if (input.id) {
    // A deterministic id is the producer's idempotency key.
    const existing = await findActivity(
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
    const event = await findOutboxEvent(
      transaction,
      input.organizationId,
      deduplicationKey,
    );
    const existing = event?.activityId
      ? await findActivity(transaction, input.organizationId, event.activityId)
      : null;
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
  const alert = await raiseAlert(
    transaction,
    activity,
    input.key,
    policy,
    input.alert,
    logger,
  );
  return { activity, commit: mergeCommits([commit, alert]) };
}

/**
 * Update an activity (for example processing → failed). When the key changes
 * to one in the alert policy map, the alert is raised in the same transaction.
 */
export async function updateActivityInTransaction(
  transaction: RecordingClient,
  ref: ActivityRef,
  input: UpdateActivityInput,
  logger?: RecordingLogger,
): Promise<RecordedActivity | null> {
  const existing = ref.organizationId
    ? await transaction.activity.findFirst({
        where: scopedWhere(ref.organizationId, { id: ref.id }),
      })
    : await runForEventOrganization(ref.organizationId ?? null, () =>
        transaction.activity.findFirst({
          where: { id: ref.id, isDeleted: false, organizationId: null },
        }),
      );
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
  const row = await runForEventOrganization(
    existing.organizationId ?? null,
    () =>
      transaction.activity.update({
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
      }),
  );
  const activity = normalizeActivityDocument(row as ActivityDocument);
  const policy =
    input.key && input.key !== existing.action
      ? getActivityAlertPolicy(input.key)
      : null;
  if (!policy || !input.key) {
    return { activity, commit: emptyCommit() };
  }
  return {
    activity,
    commit: await raiseAlert(
      transaction,
      activity,
      input.key,
      policy,
      input.alert,
      logger,
    ),
  };
}

/**
 * Write transport messages that are not activities (operator alerts, explicit
 * sends) as one outbox event with one delivery per message.
 */
export async function dispatchChannelMessagesInTransaction(
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

async function raiseAlert(
  transaction: RecordingClient,
  activity: ActivityDocument,
  key: string,
  policy: ActivityAlertPolicy,
  alert: ActivityAlertOptions | undefined,
  logger: RecordingLogger | undefined,
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
          logger?.warn('Operator alert has no rendered message', {
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
        : await findOrganizationOwner(transaction, organizationId);
    if (
      !userId ||
      !(await isActiveMember(transaction, organizationId, userId))
    ) {
      continue;
    }

    for (const channel of channels) {
      const idempotencyKey = `${deduplicationKey}/${userId}/${channel}`;
      if (channel === 'in_app') {
        if (await isInAppDisabled(transaction, userId, policy.topic)) {
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

async function findOrganizationOwner(
  transaction: RecordingClient,
  organizationId: string,
): Promise<string | null> {
  const organization = await transaction.organization.findFirst({
    select: { userId: true },
    where: { id: organizationId, isDeleted: false },
  });
  return organization?.userId ?? null;
}

async function isActiveMember(
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

async function isInAppDisabled(
  transaction: RecordingClient,
  userId: string,
  topic: string,
): Promise<boolean> {
  const preference = await transaction.notificationPreference.findFirst({
    select: { isEnabled: true },
    where: { channel: 'in_app', isDeleted: false, topic, userId },
  });
  return !(preference?.isEnabled ?? defaultInAppNotificationPreference(topic));
}
