import type {
  INotificationPayloadTypes,
  NotificationType,
} from '@genfeedai/interfaces';

/**
 * The real dispatcher (apps/server/api/src/services/notifications/notifications.service.ts)
 * publishes `INotificationEvent` from `@genfeedai/interfaces` onto the `notifications` Redis
 * channel. That shared type's `NotificationType` union is `'telegram' | 'discord' | 'email' | 'bot'`
 * and does not include `'slack'` or `'chatbot'` — but this handler's dispatch table has always
 * keyed on `'slack'` and `'chatbot'` as well (see `handleEvent`). No current producer publishes
 * those two event types (confirmed via repo-wide grep for `type: 'slack'` / `type: 'chatbot'`),
 * so those branches are presently unreached, but the type is widened locally to keep the
 * dispatch table honest without touching the shared package.
 */
export type NotificationEventType = NotificationType | 'slack' | 'chatbot';

export interface NotificationEvent {
  type: NotificationEventType;
  action: string;
  payload: INotificationPayloadTypes;
  userId?: string;
  organizationId?: string;
  timestamp?: Date;
  retryCount?: number;
}

/**
 * Runtime guard for messages arriving on the `notifications` Redis channel.
 * `RedisService#subscribe` hands handlers an already-`JSON.parse`d value typed as
 * `unknown` (see packages/libs/redis/redis.service.ts) — this narrows that value to
 * `NotificationEvent` by checking for the required fields' presence/shape.
 */
export function isNotificationEvent(
  value: unknown,
): value is NotificationEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.type === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}
