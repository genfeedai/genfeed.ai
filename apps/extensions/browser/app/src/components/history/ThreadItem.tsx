import type { ReactElement } from 'react';

import type { Thread } from '~models/chat.model';

interface ThreadItemProps {
  thread: Thread;
  onOpen: () => void;
}

const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'f',
  instagram: 'IG',
  linkedin: 'in',
  reddit: 'R',
  tiktok: 'TT',
  twitter: 'X',
  youtube: 'YT',
};

export function ThreadItem({ thread, onOpen }: ThreadItemProps): ReactElement {
  const platformIcon = thread.platform ? PLATFORM_ICONS[thread.platform] : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-secondary/50"
    >
      {platformIcon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-secondary text-[10px] font-bold text-muted-foreground">
          {platformIcon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {thread.title || 'Untitled thread'}
        </p>
        {thread.lastMessage && (
          <p className="truncate text-xs text-muted-foreground">
            {thread.lastMessage}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatRelativeTime(thread.updatedAt)}
      </span>
    </button>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours}h`;
  }
  if (days < 7) {
    return `${days}d`;
  }
  return new Date(dateStr).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
  });
}
