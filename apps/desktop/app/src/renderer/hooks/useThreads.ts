import type {
  IDesktopMessage,
  IDesktopThread,
} from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureUser } from '../db/pglite';
import { queryThreads, upsertMessages, upsertThread } from '../db/threads';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function useThreads(
  workspaceId: string | null,
  localUserId: string | null,
) {
  const [threads, setThreads] = useState<IDesktopThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const hasAutoSelected = useRef(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  /* ─── Load from PGlite ─── */

  useEffect(() => {
    if (!localUserId) {
      setThreads([]);
      hasAutoSelected.current = false;
      return;
    }

    const load = async () => {
      try {
        await ensureUser(localUserId);
        const loaded = await queryThreads(localUserId);
        setThreads(loaded);
        if (loaded.length > 0 && !hasAutoSelected.current) {
          setActiveThreadId(loaded[0].id);
          hasAutoSelected.current = true;
        }
      } catch {
        setThreads([]);
      }
    };

    void load();
  }, [localUserId]);

  /* ─── Mutations ─── */

  const createThread = useCallback((): IDesktopThread => {
    const now = new Date().toISOString();
    const thread: IDesktopThread = {
      createdAt: now,
      id: generateId(),
      messages: [],
      status: 'idle',
      title: 'New conversation',
      updatedAt: now,
      workspaceId: workspaceId ?? undefined,
    };

    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);

    if (localUserId) {
      void upsertThread(localUserId, thread);
    }

    return thread;
  }, [workspaceId, localUserId]);

  const addMessage = useCallback(
    (threadId: string, message: IDesktopMessage) => {
      setThreads((prev) => {
        const next = prev.map((t) => {
          if (t.id !== threadId) return t;

          const isFirst = t.messages.length === 0 && message.role === 'user';
          const updated: IDesktopThread = {
            ...t,
            messages: [...t.messages, message],
            status:
              message.role === 'user'
                ? ('awaiting-response' as const)
                : ('idle' as const),
            title: isFirst ? truncate(message.content, 40) : t.title,
            updatedAt: new Date().toISOString(),
          };

          if (localUserId) {
            void upsertThread(localUserId, updated).then(() =>
              upsertMessages(threadId, [message]),
            );
          }

          return updated;
        });

        return next;
      });
    },
    [localUserId],
  );

  const setThreadStatus = useCallback(
    (threadId: string, status: 'awaiting-response' | 'idle') => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;
          const updated = { ...t, status };
          if (localUserId) {
            void upsertThread(localUserId, updated);
          }
          return updated;
        }),
      );
    },
    [localUserId],
  );

  return {
    activeThread,
    activeThreadId,
    addMessage,
    createThread,
    setActiveThreadId,
    setThreadStatus,
    threads,
  };
}
