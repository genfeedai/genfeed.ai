'use client';

import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useUIStore } from '../stores/uiStore';

const typeStyles = {
  error: 'bg-red-900 border-red-700 text-red-100',
  info: 'bg-neutral-800 border-neutral-600 text-neutral-100',
  success: 'bg-green-900 border-green-700 text-green-100',
  warning: 'bg-orange-900 border-orange-600 text-orange-100',
} as const;

const typeIcons = {
  error: XCircle,
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
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
      className={`flex flex-col rounded-lg border shadow-xl animate-in fade-in slide-in-from-top-4 duration-300 max-w-md ${typeStyles[type]}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className="w-5 h-5 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{title}</span>
          {message && (
            <p className="text-xs opacity-80 mt-0.5 break-words">{message}</p>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
          title="Copy message"
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
        <button
          onClick={() => removeNotification(id)}
          className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
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
