import type { AlertSeverity } from './activity-alert-policy.interface';

/** The activity an inbox alert was raised for (#5197). */
export interface INotificationInboxActivity {
  id: string;
  key: string;
  value: string | null;
  source: string | null;
  brandId: string | null;
  entityId: string | null;
  entityModel: string | null;
  createdAt: string;
}

export interface INotificationInboxItem {
  id: string;
  topic: string;
  occurredAt: string;
  readAt: string | null;
  outcome: 'completed' | 'failed';
  sourceHref: string | null;
  sourceLabel: string | null;
  failure: { title: string; summary: string; recovery: string | null } | null;
  /** Present on `social.reply` items: new replies on one connected account. */
  socialReply?: { replyCount: number; accountHandle: string | null } | null;
  /** Severity from the activity alert policy. */
  severity?: AlertSeverity | null;
  /** The source activity; null for alerts recorded before #5197. */
  activity?: INotificationInboxActivity | null;
}
export interface INotificationInboxPage {
  items: INotificationInboxItem[];
  nextCursor: string | null;
}
export interface INotificationInboxCount {
  id: string;
  unreadCount: number;
}
