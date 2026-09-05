'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@genfeedai/ui/primitives/button';
import {
  Check,
  CircleCheckBig,
  CircleX,
  Copy,
  Info,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useUIStore } from '../stores/uiStore';

const typeStyles = {
  error: 'bg-destructive/10 border-destructive/30 text-destructive',
  info: 'bg-secondary border-border text-foreground',
  success: 'bg-success/10 border-success/30 text-success',
  warning: 'bg-warning/10 border-warning/30 text-warning',
} as const;

const typeIcons = {
  error: CircleX,
  info: Info,
  success: CircleCheckBig,
  warning: TriangleAlert,
} as const;

function NotificationItem({
  id,
  type,
  title,
  message,
}: {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}) {
  const removeNotification = useUIStore((state) => state.removeNotification);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = message ? `${title}\n\n${message}` : title;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [title, message]);

  const Icon = typeIcons[type];

  return (
    <div
      className={`flex flex-col border shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 max-w-md ${typeStyles[type]}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className="size-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{title}</span>
          {message && (
            <p className="text-xs opacity-80 mt-0.5 break-words">{message}</p>
          )}
        </div>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleCopy}
          className="size-auto shrink-0 p-1 hover:bg-foreground/10"
          title="Copy message"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={() => removeNotification(id)}
          className="size-auto shrink-0 p-1 hover:bg-foreground/10"
          title="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationToast() {
  const notifications = useUIStore((state) => state.notifications);

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[200] flex flex-col gap-2">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          id={notification.id}
          type={notification.type}
          title={notification.title}
          message={notification.message}
        />
      ))}
    </div>
  );
}
