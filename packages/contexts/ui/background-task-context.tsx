'use client';

import { useCurrentUser } from '@genfeedai/contexts/user/user-context/user-context';
import type {
  IBackgroundTask,
  IBackgroundTaskContextType,
  IBackgroundTaskUpdateEvent,
} from '@genfeedai/interfaces';
import type { LayoutProps } from '@genfeedai/props/layout/layout.props';
import {
  buildGenerationEtaSnapshot,
  type GenerationEtaSnapshot,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const STORAGE_KEY_PREFIX = 'gf_background_tasks';

function getStorageKey(userId?: string | null): string {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}

function deriveTaskType(event: IBackgroundTaskUpdateEvent): string {
  if (event.resultType) {
    return event.resultType.toLowerCase();
  }

  if (event.label?.toLowerCase().includes('merge')) {
    return 'merge';
  }

  return 'background';
}

function clampProgress(progress: number | undefined, status: string): number {
  if (status === 'completed') {
    return 100;
  }

  if (typeof progress !== 'number') {
    return 0;
  }

  return Math.max(0, Math.min(100, progress));
}

function deriveEtaTaskType(
  type: string,
  event: Pick<IBackgroundTaskUpdateEvent, 'label' | 'resultType'>,
): 'article' | 'avatar' | 'background' | 'image' | 'music' | 'video' {
  const normalizedType = type.toLowerCase();
  const label = event.label?.toLowerCase() ?? '';
  const resultType = event.resultType?.toLowerCase() ?? '';
  const fingerprint = `${normalizedType} ${label} ${resultType}`;

  if (fingerprint.includes('article')) {
    return 'article';
  }
  if (fingerprint.includes('avatar')) {
    return 'avatar';
  }
  if (fingerprint.includes('image')) {
    return 'image';
  }
  if (fingerprint.includes('music')) {
    return 'music';
  }
  if (fingerprint.includes('video')) {
    return 'video';
  }

  return 'background';
}

function normalizeEtaConfidence(
  value: string | undefined,
): GenerationEtaSnapshot['etaConfidence'] {
  return value === 'low' || value === 'medium' || value === 'high'
    ? value
    : undefined;
}

function deriveEtaFields(
  event: IBackgroundTaskUpdateEvent,
  existingTask: IBackgroundTask | undefined,
  taskType: string,
): Pick<
  IBackgroundTask,
  | 'currentPhase'
  | 'estimatedDurationMs'
  | 'etaConfidence'
  | 'lastEtaUpdateAt'
  | 'remainingDurationMs'
  | 'startedAt'
> {
  const startedAt =
    event.startedAt ??
    existingTask?.startedAt ??
    existingTask?.createdAt ??
    event.timestamp;
  const snapshot: GenerationEtaSnapshot | null =
    event.estimatedDurationMs || event.remainingDurationMs || event.currentPhase
      ? {
          currentPhase: event.currentPhase,
          estimatedDurationMs: event.estimatedDurationMs,
          etaConfidence: normalizeEtaConfidence(event.etaConfidence),
          lastEtaUpdateAt: event.lastEtaUpdateAt ?? new Date().toISOString(),
          remainingDurationMs:
            event.status === 'completed' || event.status === 'failed'
              ? 0
              : event.remainingDurationMs,
          startedAt,
        }
      : buildGenerationEtaSnapshot({
          currentPhase:
            event.currentPhase ?? existingTask?.currentPhase ?? 'Generating',
          model: event.label,
          progress:
            event.status === 'completed' || event.status === 'failed'
              ? 100
              : event.progress,
          startedAt,
          type: deriveEtaTaskType(taskType, event),
        });

  if (!snapshot || !shouldDisplayEta(snapshot)) {
    return {
      currentPhase:
        event.currentPhase ??
        existingTask?.currentPhase ??
        (event.status === 'completed'
          ? 'Completed'
          : event.status === 'failed'
            ? 'Failed'
            : 'Processing'),
      estimatedDurationMs: existingTask?.estimatedDurationMs,
      etaConfidence: existingTask?.etaConfidence,
      lastEtaUpdateAt:
        event.lastEtaUpdateAt ?? existingTask?.lastEtaUpdateAt ?? undefined,
      remainingDurationMs:
        event.status === 'completed' || event.status === 'failed'
          ? 0
          : existingTask?.remainingDurationMs,
      startedAt,
    };
  }

  return {
    currentPhase:
      event.currentPhase ??
      snapshot.currentPhase ??
      existingTask?.currentPhase ??
      'Processing',
    estimatedDurationMs:
      snapshot.estimatedDurationMs ?? existingTask?.estimatedDurationMs,
    etaConfidence: snapshot.etaConfidence ?? existingTask?.etaConfidence,
    lastEtaUpdateAt:
      snapshot.lastEtaUpdateAt ??
      event.lastEtaUpdateAt ??
      existingTask?.lastEtaUpdateAt,
    remainingDurationMs:
      event.status === 'completed' || event.status === 'failed'
        ? 0
        : (snapshot.remainingDurationMs ?? existingTask?.remainingDurationMs),
    startedAt,
  };
}

function parsePersistedTasks(value: string | null): IBackgroundTask[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (
          item,
        ): item is Omit<IBackgroundTask, 'completedAt'> &
          Partial<Pick<IBackgroundTask, 'completedAt'>> =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.id === 'string' &&
          typeof item.type === 'string' &&
          typeof item.status === 'string' &&
          typeof item.progress === 'number' &&
          typeof item.title === 'string' &&
          typeof item.createdAt === 'string' &&
          (item.startedAt === undefined ||
            typeof item.startedAt === 'string') &&
          (item.currentPhase === undefined ||
            typeof item.currentPhase === 'string') &&
          (item.lastEtaUpdateAt === undefined ||
            typeof item.lastEtaUpdateAt === 'string') &&
          (item.estimatedDurationMs === undefined ||
            typeof item.estimatedDurationMs === 'number') &&
          (item.remainingDurationMs === undefined ||
            typeof item.remainingDurationMs === 'number') &&
          (item.etaConfidence === undefined ||
            typeof item.etaConfidence === 'string'),
      )
      .map((item) => ({
        ...item,
        completedAt:
          item.completedAt === null || typeof item.completedAt === 'string'
            ? item.completedAt
            : null,
        startedAt:
          item.startedAt === undefined || typeof item.startedAt === 'string'
            ? item.startedAt
            : undefined,
      }))
      .filter(
        (item) =>
          item.completedAt === null || typeof item.completedAt === 'string',
      ) as IBackgroundTask[];
  } catch {
    return [];
  }
}

const BackgroundTaskContext = createContext<IBackgroundTaskContextType | null>(
  null,
);

export function BackgroundTaskProvider({ children }: LayoutProps) {
  const { currentUser } = useCurrentUser();
  const storageKey = getStorageKey(currentUser?.id);
  const [tasks, setTasks] = useState<IBackgroundTask[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    setTasks(parsePersistedTasks(window.localStorage.getItem(storageKey)));
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(tasks));
  }, [tasks, storageKey]);

  const addTask = useCallback((task: IBackgroundTask) => {
    setTasks((previousTasks) => {
      const existingTaskIndex = previousTasks.findIndex(
        (previousTask) => previousTask.id === task.id,
      );

      if (existingTaskIndex === -1) {
        return [task, ...previousTasks];
      }

      const nextTasks = [...previousTasks];
      nextTasks[existingTaskIndex] = {
        ...nextTasks[existingTaskIndex],
        ...task,
      };
      return nextTasks;
    });
  }, []);

  const updateTask = useCallback(
    (taskId: string, updates: Partial<IBackgroundTask>) => {
      setTasks((previousTasks) =>
        previousTasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task,
        ),
      );
    },
    [],
  );

  const removeTask = useCallback((taskId: string) => {
    setTasks((previousTasks) =>
      previousTasks.filter((task) => task.id !== taskId),
    );
  }, []);

  const clearTasks = useCallback(() => {
    setTasks([]);
  }, []);

  const upsertTaskFromEvent = useCallback(
    (event: IBackgroundTaskUpdateEvent) => {
      const timestamp = event.timestamp || new Date().toISOString();

      setTasks((previousTasks) => {
        const existingTask = previousTasks.find(
          (task) => task.id === event.taskId,
        );
        const taskType = existingTask?.type ?? deriveTaskType(event);
        const etaFields = deriveEtaFields(event, existingTask, taskType);

        const nextTask: IBackgroundTask = {
          completedAt:
            event.status === 'completed' || event.status === 'failed'
              ? timestamp
              : (existingTask?.completedAt ?? null),
          createdAt: existingTask?.createdAt ?? timestamp,
          currentPhase: etaFields.currentPhase,
          error: event.error ?? existingTask?.error,
          estimatedDurationMs: etaFields.estimatedDurationMs,
          etaConfidence: etaFields.etaConfidence,
          id: event.taskId,
          lastEtaUpdateAt: etaFields.lastEtaUpdateAt,
          progress:
            event.progress !== undefined
              ? clampProgress(event.progress, event.status)
              : (existingTask?.progress ??
                clampProgress(undefined, event.status)),
          remainingDurationMs: etaFields.remainingDurationMs,
          resultId: event.resultId ?? existingTask?.resultId,
          resultType: event.resultType ?? existingTask?.resultType,
          startedAt: etaFields.startedAt,
          status: event.status,
          title: event.label ?? existingTask?.title ?? 'Background Task',
          type: taskType,
        };

        if (existingTask) {
          return previousTasks.map((task) =>
            task.id === event.taskId ? nextTask : task,
          );
        }

        return [nextTask, ...previousTasks];
      });
    },
    [],
  );

  const value = useMemo<IBackgroundTaskContextType>(
    () => ({
      addTask,
      clearTasks,
      removeTask,
      tasks,
      updateTask,
      upsertTaskFromEvent,
    }),
    [addTask, clearTasks, removeTask, tasks, updateTask, upsertTaskFromEvent],
  );

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
    </BackgroundTaskContext.Provider>
  );
}

export function useBackgroundTaskContext(): IBackgroundTaskContextType {
  const context = useContext(BackgroundTaskContext);

  if (!context) {
    throw new Error(
      'useBackgroundTaskContext must be used within BackgroundTaskProvider',
    );
  }

  return context;
}
