import { type ReactElement, useEffect, useState } from 'react';

import { ThreadItem } from '~components/history/ThreadItem';
import { LoadingSpinner } from '~components/ui';
import type { Thread } from '~models/chat.model';
import { useChatStore } from '~store/use-chat-store';

interface ThreadListProps {
  onOpenThread: () => void;
}

export function ThreadList({ onOpenThread }: ThreadListProps): ReactElement {
  const threads = useChatStore((s) => s.threads);
  const setThreads = useChatStore((s) => s.setThreads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const setMessages = useChatStore((s) => s.setMessages);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { event: 'chatGetThreads', payload: { limit: 50, page: 1 } },
      (response) => {
        if (response?.success && response.threads) {
          setThreads(response.threads);
        }
        setIsLoading(false);
      },
    );
  }, [setThreads]);

  function handleOpen(thread: Thread) {
    setActiveThread(thread.id);
    chrome.runtime.sendMessage(
      {
        event: 'chatGetMessages',
        payload: { limit: 50, page: 1, threadId: thread.id },
      },
      (response) => {
        if (response?.success && response.messages) {
          setMessages(response.messages);
        }
        onOpenThread();
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="md" className="text-primary" />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-muted-foreground">No threads yet</p>
        <p className="text-xs text-muted-foreground">
          Start chatting to see your history here
        </p>
      </div>
    );
  }

  const grouped = groupByDate(threads);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {grouped.map(({ label, items }) => (
          <div key={label}>
            <div className="sticky top-0 bg-background px-4 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
            </div>
            {items.map((conv) => (
              <ThreadItem
                key={conv.id}
                thread={conv}
                onOpen={() => handleOpen(conv)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface GroupedThreads {
  label: string;
  items: Thread[];
}

function groupByDate(threads: Thread[]): GroupedThreads[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 604800000);

  const groups: Record<string, Thread[]> = {
    Older: [],
    'This Week': [],
    Today: [],
    Yesterday: [],
  };

  for (const thread of threads) {
    const date = new Date(thread.createdAt);
    if (date >= today) {
      groups.Today.push(thread);
    } else if (date >= yesterday) {
      groups.Yesterday.push(thread);
    } else if (date >= weekAgo) {
      groups['This Week'].push(thread);
    } else {
      groups.Older.push(thread);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ items, label }));
}
