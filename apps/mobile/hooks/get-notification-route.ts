export interface NotificationData {
  type?: string;
  contentId?: string;
  approvalId?: string;
}

export type NotificationRoute =
  | { path: `/ingredient/${string}` }
  | { path: '/analytics' }
  | null;

export function getNotificationRoute(
  data: NotificationData,
): NotificationRoute {
  switch (data.type) {
    case 'content_ready':
      return data.contentId ? { path: `/ingredient/${data.contentId}` } : null;
    case 'analytics_update':
      return { path: '/analytics' };
    case 'approval_request':
    case 'approval_reminder':
    case 'approval_decision':
      return null;
    default:
      return null;
  }
}
