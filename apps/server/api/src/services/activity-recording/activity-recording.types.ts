import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import type {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
} from '@genfeedai/contracts';
import type {
  AlertChannel,
  ChannelMessageType,
  IChannelMessage,
} from '@genfeedai/contracts/interfaces';

/** One message to an explicit destination (address, chat or channel id). */
export interface ChannelDestinationMessage {
  /** Null routes the message to the operator's configured channel. */
  destination: string | null;
  message: IChannelMessage;
}

/** Producer-supplied alert context. The policy map decides whether it is used. */
export interface ActivityAlertOptions {
  /**
   * Makes the record idempotent: a second record with the same key returns the
   * first activity and writes nothing. Defaults to `<key>/<activityId>`.
   */
  deduplicationKey?: string;
  /** Domain source of the alert (defaults to the activity itself). */
  source?: { type: string; id: string };
  /** Who caused the event when that differs from the recipient. */
  actorUserId?: string | null;
  /** Payload the inbox and email renderers read. */
  payload?: Record<string, unknown>;
  occurredAt?: Date;
  /** Narrows the policy's default channels; can never widen them. */
  channels?: readonly AlertChannel[];
  /** Rendered message for each `operator` channel in the policy. */
  operatorMessages?: Partial<Record<ChannelMessageType, IChannelMessage>>;
  /** Messages for the policy's `explicit` channels. */
  destinations?: readonly ChannelDestinationMessage[];
}

export interface RecordActivityInput {
  /** Deterministic id for producers that dedupe on the activity row itself. */
  id?: string;
  key: ActivityKey;
  source: ActivitySource | string;
  /** Null only for a platform event with no tenant. */
  organizationId: string | null;
  userId?: string | null;
  brandId?: string | null;
  entityId?: string | null;
  entityModel?: ActivityEntityModel | string | null;
  value?: string;
  isRead?: boolean;
  data?: Record<string, unknown>;
  alert?: ActivityAlertOptions;
}

export interface UpdateActivityInput {
  key?: ActivityKey;
  source?: ActivitySource | string;
  userId?: string | null;
  brandId?: string | null;
  entityId?: string | null;
  entityModel?: ActivityEntityModel | string | null;
  value?: string;
  isRead?: boolean;
  data?: Record<string, unknown>;
  alert?: ActivityAlertOptions;
}

/** The row to update, as the producer already knows it. */
export interface ActivityRef {
  id: string;
  organizationId?: string | null;
}

/** A transport message that is not an activity (operator or explicit send). */
export interface ChannelDispatchInput {
  /** Null only for a platform (operator) message with no tenant. */
  organizationId: string | null;
  deduplicationKey: string;
  topic: string;
  source: { type: string; id: string };
  actorUserId?: string | null;
  occurredAt?: Date;
  messages: readonly ChannelDestinationMessage[];
}

/** Side effects to run once the recording transaction has committed. */
export interface RecordingCommit {
  activities: ActivityDocument[];
  pendingDeliveryIds: string[];
  inbox: Array<{ organizationId: string; userIds: string[] }>;
}

export interface RecordedActivity {
  activity: ActivityDocument;
  commit: RecordingCommit;
}
