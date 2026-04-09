import {
  BackgroundTaskProvider,
  useBackgroundTaskContext,
} from '@genfeedai/contexts/ui/background-task-context';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => ({
    currentUser: { id: 'test-user-123' },
  }),
}));

const STORAGE_KEY = 'gf_background_tasks_test-user-123';

// Mock localStorage for jsdom compatibility
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

function wrapper({ children }: PropsWithChildren) {
  return <BackgroundTaskProvider>{children}</BackgroundTaskProvider>;
}

describe('BackgroundTaskContext', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('hydrates tasks from localStorage', () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          completedAt: null,
          createdAt: '2026-01-01T10:00:00.000Z',
          id: 'task-1',
          progress: 35,
          status: 'processing',
          title: 'Video Generation',
          type: 'video',
        },
      ]),
    );

    const { result } = renderHook(() => useBackgroundTaskContext(), {
      wrapper,
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe('task-1');
  });

  it('upserts websocket events and persists', () => {
    const { result } = renderHook(() => useBackgroundTaskContext(), {
      wrapper,
    });

    act(() => {
      result.current.upsertTaskFromEvent({
        label: 'Music Generation',
        progress: 55,
        status: 'processing',
        taskId: 'task-2',
        timestamp: '2026-01-02T10:00:00.000Z',
      });
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].title).toBe('Music Generation');
    expect(result.current.tasks[0].progress).toBe(55);

    const persisted = localStorageMock.getItem(STORAGE_KEY);
    expect(persisted).toContain('task-2');
  });

  it('supports remove and clear actions', () => {
    const { result } = renderHook(() => useBackgroundTaskContext(), {
      wrapper,
    });

    act(() => {
      result.current.addTask({
        completedAt: null,
        createdAt: '2026-01-03T10:00:00.000Z',
        id: 'task-3',
        progress: 0,
        status: 'pending',
        title: 'Task 3',
        type: 'background',
      });
      result.current.addTask({
        completedAt: null,
        createdAt: '2026-01-03T10:01:00.000Z',
        id: 'task-4',
        progress: 0,
        status: 'pending',
        title: 'Task 4',
        type: 'background',
      });
    });

    act(() => {
      result.current.removeTask('task-3');
    });
    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].id).toBe('task-4');

    act(() => {
      result.current.clearTasks();
    });
    expect(result.current.tasks).toHaveLength(0);
  });

  it('scopes storage key to user ID', () => {
    const { result } = renderHook(() => useBackgroundTaskContext(), {
      wrapper,
    });

    act(() => {
      result.current.addTask({
        completedAt: null,
        createdAt: '2026-01-03T10:00:00.000Z',
        id: 'task-scoped',
        progress: 0,
        status: 'pending',
        title: 'Scoped Task',
        type: 'background',
      });
    });

    expect(localStorageMock.getItem(STORAGE_KEY)).toContain('task-scoped');
    expect(localStorageMock.getItem('gf_background_tasks')).toBeNull();
  });
});
