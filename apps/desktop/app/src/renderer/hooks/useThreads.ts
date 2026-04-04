import type { IDesktopMessage, IDesktopThread } from '@genfeedai/desktop-contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

const THREADS_PATH = '.genfeed/threads.json';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function useThreads(workspaceId: string | null) {
  const [threads, setThreads] = useState<IDesktopThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const persistRef = useRef(false);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const loadThreads = useCallback(async () => {
    if (!workspaceId) {
      setThreads([]);
      return;
    }

    try {
      const raw = await window.genfeedDesktop.files.readFile(
        workspaceId,
        THREADS_PATH,
      );
      const parsed = JSON.parse(raw) as IDesktopThread[];
      setThreads(parsed);

      if (parsed.length > 0 && !activeThreadId) {
        setActiveThreadId(parsed[0].id);
      }
    } catch {
      setThreads([]);
    }
  }, [workspaceId, activeThreadId]);

  const persistThreads = useCallback(
    async (nextThreads: IDesktopThread[]) => {
      if (!workspaceId) return;

      try {
        await window.genfeedDesktop.files.writeFile(
          workspaceId,
          THREADS_PATH,
          JSON.stringify(nextThreads, null, 2),
        );
      } catch (err) {
        console.error('Failed to persist threads:', err);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (persistRef.current) {
      void persistThreads(threads);
    }
    persistRef.current = true;
  }, [threads, persistThreads]);

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
    return thread;
  }, [workspaceId]);

  const addMessage = useCallback(
    (threadId: string, message: IDesktopMessage) => {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== threadId) return t;

          const isFirst = t.messages.length === 0 && message.role === 'user';
          return {
            ...t,
            messages: [...t.messages, message],
            status:
              message.role === 'user'
                ? ('awaiting-response' as const)
                : ('idle' as const),
            title: isFirst ? truncate(message.content, 40) : t.title,
            updatedAt: new Date().toISOString(),
          };
        }),
      );
    },
    [],
  );

  const setThreadStatus = useCallback(
    (threadId: string, status: 'awaiting-response' | 'idle') => {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, status } : t)),
      );
    },
    [],
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
