'use client';

import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PanelToggle from '@/components/shell/PanelToggle';
import { useNotificationInbox } from '@/components/shell/use-notification-inbox';

type NotificationInboxToggleProps = {
  readonly isPressed: boolean;
  readonly onToggle: () => void;
};

/** The bell: opens the notifications view of the side panel. */
export default function NotificationInboxToggle({
  isPressed,
  onToggle,
}: NotificationInboxToggleProps) {
  const translate = useTranslations('common.notificationInbox');
  const { count } = useNotificationInbox(false);
  const unreadCount = count.data?.unreadCount;
  const label =
    unreadCount === undefined
      ? translate(isPressed ? 'close' : 'open')
      : translate(isPressed ? 'closeCount' : 'openCount', {
          count: unreadCount,
        });

  return (
    <PanelToggle
      ariaControls="workspace-notifications-panel"
      badge={
        unreadCount ? (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-info"
          ></span>
        ) : null
      }
      icon={<Bell aria-hidden="true" className="size-4" />}
      isPressed={isPressed}
      label={label}
      onToggle={onToggle}
      testId="topbar-notifications-toggle"
    />
  );
}
