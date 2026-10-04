import { NOTIFICATION_DELIVERY_STATUS } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { IChannelMessage } from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';

/**
 * The only writer of `notification_events` and `notification_deliveries` rows
 * (#5197). Every caller passes its own transaction client, so the event and
 * its deliveries commit atomically with the state change that produced them.
 * `check:architecture` fails on an outbox write anywhere else.
 */

export interface OutboxEventInput {
  /** Null only for a platform (operator) event with no tenant. */
  organizationId: string | null;
  activityId?: string | null;
  eventKey: string;
  deduplicationKey: string;
  sourceType: string;
  sourceId: string;
  actorUserId?: string | null;
  payload: Prisma.InputJsonObject;
  occurredAt: Date;
}

export interface OutboxDeliveryInput {
  channel: string;
  provider: string;
  topic: string;
  idempotencyKey: string;
  /** A user delivery. Null for a channel delivery to a destination. */
  userId?: string | null;
  destination?: string | null;
  message?: IChannelMessage | null;
  /** `delivered` for an in-app delivery, which no worker ever claims. */
  isDelivered?: boolean;
  /** Defers the first attempt (for example a scheduled email). */
  nextAttemptAt?: Date;
}

export interface OutboxWriteResult {
  eventId: string;
  /** Every delivery row, in input order. */
  deliveryIds: string[];
  /** Deliveries a worker must still send (enqueue these after commit). */
  pendingDeliveryIds: string[];
  /** Users whose bell gained an item (publish an inbox refresh after commit). */
  inboxUserIds: string[];
}

/**
 * Platform (operator) events carry `organizationId: null` and belong to no
 * tenant, so inside a request the CLOUD tenant guard has no organization to
 * prove for them. Tenant events run unchanged under their own scope. This is
 * the single place the platform-event hatch is opened.
 */
export function runForEventOrganization<T>(
  organizationId: string | null,
  run: () => Promise<T>,
): Promise<T> {
  return organizationId ? run() : crossOrgUnsafe(async () => await run());
}

type OutboxClient = Pick<
  Prisma.TransactionClient,
  'notificationDelivery' | 'notificationEvent'
>;

export async function findOutboxEvent(
  client: Pick<Prisma.TransactionClient, 'notificationEvent'>,
  organizationId: string | null,
  deduplicationKey: string,
): Promise<{ activityId: string | null; id: string } | null> {
  return organizationId
    ? client.notificationEvent.findFirst({
        select: { activityId: true, id: true },
        where: scopedWhere(organizationId, { deduplicationKey }),
      })
    : runForEventOrganization(organizationId, () =>
        client.notificationEvent.findFirst({
          select: { activityId: true, id: true },
          where: { deduplicationKey, isDeleted: false, organizationId: null },
        }),
      );
}

export async function writeNotificationOutbox(
  client: OutboxClient,
  event: OutboxEventInput,
  deliveries: readonly OutboxDeliveryInput[],
): Promise<OutboxWriteResult> {
  const create = {
    activityId: event.activityId ?? null,
    actorUserId: event.actorUserId ?? null,
    deduplicationKey: event.deduplicationKey,
    eventKey: event.eventKey,
    occurredAt: event.occurredAt,
    organizationId: event.organizationId,
    payload: event.payload,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };
  const stored = event.organizationId
    ? await client.notificationEvent.upsert({
        create,
        update: {},
        where: scopedWhere(event.organizationId, {
          deduplicationKey: event.deduplicationKey,
        }),
      })
    : await runForEventOrganization(event.organizationId, () =>
        client.notificationEvent.upsert({
          create,
          update: {},
          where: {
            deduplicationKey: event.deduplicationKey,
            isDeleted: false,
            organizationId: null,
          },
        }),
      );

  const deliveryIds: string[] = [];
  const pendingDeliveryIds: string[] = [];
  const inboxUserIds: string[] = [];
  for (const delivery of deliveries) {
    const createDelivery = {
      channel: delivery.channel,
      ...(delivery.isDelivered ? { deliveredAt: event.occurredAt } : {}),
      destination: delivery.destination ?? null,
      eventId: stored.id,
      idempotencyKey: delivery.idempotencyKey,
      ...(delivery.message
        ? { message: toInputJsonObject(delivery.message) }
        : {}),
      nextAttemptAt: delivery.nextAttemptAt ?? event.occurredAt,
      organizationId: event.organizationId,
      provider: delivery.provider,
      status: delivery.isDelivered
        ? NOTIFICATION_DELIVERY_STATUS.DELIVERED
        : NOTIFICATION_DELIVERY_STATUS.PENDING,
      topic: delivery.topic,
      userId: delivery.userId ?? null,
    };
    const row = event.organizationId
      ? await client.notificationDelivery.upsert({
          create: createDelivery,
          select: { id: true, status: true },
          update: {},
          where: scopedWhere(event.organizationId, {
            idempotencyKey: delivery.idempotencyKey,
          }),
        })
      : await runForEventOrganization(event.organizationId, () =>
          client.notificationDelivery.upsert({
            create: createDelivery,
            select: { id: true, status: true },
            update: {},
            where: {
              idempotencyKey: delivery.idempotencyKey,
              isDeleted: false,
              organizationId: null,
            },
          }),
        );
    deliveryIds.push(row.id);
    if (row.status === NOTIFICATION_DELIVERY_STATUS.PENDING) {
      pendingDeliveryIds.push(row.id);
    }
    if (
      delivery.isDelivered &&
      delivery.channel === 'in_app' &&
      delivery.userId
    ) {
      inboxUserIds.push(delivery.userId);
    }
  }

  return { deliveryIds, eventId: stored.id, inboxUserIds, pendingDeliveryIds };
}

/** Channel payload interfaces have no index signature; store their JSON form. */
function toInputJsonObject(message: IChannelMessage): Prisma.InputJsonObject {
  const json: Prisma.InputJsonObject = JSON.parse(JSON.stringify(message));
  return json;
}
