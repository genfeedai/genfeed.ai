/**
 * Why a post counts as stalled. Each kind names the last event that moved the
 * post forward and the state it is stuck in.
 *
 * - `draft_unreviewed`: a draft nobody has reviewed since it was created.
 * - `changes_not_actioned`: a draft that was rejected or sent back for changes
 *   and has had no review since.
 * - `approved_not_scheduled`: a draft that was approved and never scheduled.
 * - `schedule_overdue`: a scheduled post whose slot passed without publishing.
 * - `publish_failed`: a post whose last publish attempt failed.
 */
export const AGENT_STALLED_ITEM_KINDS = [
  'approved_not_scheduled',
  'changes_not_actioned',
  'draft_unreviewed',
  'publish_failed',
  'schedule_overdue',
] as const;

export type AgentStalledItemKind = (typeof AGENT_STALLED_ITEM_KINDS)[number];

/**
 * The events that count as progress. An edit, a rename or opening the record
 * is not one of them, so it never resets the clock.
 */
export type AgentStalledEventType =
  | 'created'
  | 'publish_attempt'
  | 'review_decision'
  | 'scheduled_for';

export interface AgentStalledLastEvent {
  /** ISO 8601 time of the event. */
  at: string;
  type: AgentStalledEventType;
}

/**
 * Items carry ids, not URLs: the server does not know the org and brand slugs,
 * so the client builds the link to the post.
 */
export interface AgentStalledItem {
  brandId: string;
  /** Whole days since the last meaningful event, rounded down. */
  daysStalled: number;
  kind: AgentStalledItemKind;
  lastEvent: AgentStalledLastEvent;
  platform: string | null;
  postId: string;
  /** First 120 characters of the post text. */
  preview: string;
  /** Owner of the post. */
  userId: string;
}

export interface AgentStalledItemsResult {
  items: AgentStalledItem[];
  /** True when more stalled items matched than `limit` returned. */
  isTruncated: boolean;
  /** True when the scan stopped at its read cap, so older items may be missing. */
  isScanLimited: boolean;
  /** Inactivity window in days. */
  windowDays: number;
}
