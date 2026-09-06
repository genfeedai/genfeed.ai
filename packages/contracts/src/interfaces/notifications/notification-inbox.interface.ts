export interface INotificationInboxItem {
  id: string;
  topic: string;
  occurredAt: string;
  readAt: string | null;
  outcome: 'completed' | 'failed';
  sourceHref: string | null;
  sourceLabel: string | null;
  failure: { title: string; summary: string; recovery: string | null } | null;
}
export interface INotificationInboxPage {
  items: INotificationInboxItem[];
  nextCursor: string | null;
}
export interface INotificationInboxCount {
  id: string;
  unreadCount: number;
}
