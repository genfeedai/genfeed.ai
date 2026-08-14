export interface NotificationData {
  type?: string;
  contentId?: string;
  approvalId?: string;
}

export type NotificationRoute =
  | { path: `/ingredient/${string}` }
  | { path: '/analytics' }
  | { path: `/approval/${string}` }
  | { path: '/approvals' }
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
      return data.approvalId ? { path: `/approval/${data.approvalId}` } : null;
    case 'approval_decision':
      return { path: '/approvals' };
    default:
      return null;
  }
}
