import type {
  IWorkspaceInboxRead,
  IWorkspaceInboxReadState,
} from '@genfeedai/contracts/interfaces';
import { useWorkspaceInboxCount } from '@hooks/data/tasks/use-workspace-inbox-count';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { Task } from '@services/management/tasks.service';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
  workspaceOrganizationId: 'workspace-a',
  identity: {
    userId: 'user-1',
    orgId: 'org-1' as string | null,
    getToken: vi.fn(),
  },
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ organizationId: mocks.workspaceOrganizationId }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@helpers/auth/auth.helper', () => ({
  resolveAuthToken: async () => 'token',
}));
vi.mock('@services/management/tasks.service', async (original) => ({
  ...(await original<typeof import('@services/management/tasks.service')>()),
  TasksService: {
    getInstance: () => ({
      findInboxReadState: mocks.get,
      markInboxRead: mocks.read,
      markAllInboxRead: mocks.readAll,
    }),
  },
}));

import {
  isWorkspaceInboxTaskUnread,
  useWorkspaceInboxRead,
} from '@hooks/data/tasks/use-workspace-inbox-read';

const task = new Task({
  id: 'task-1',
  updatedAt: '2026-10-05T10:00:00.000Z',
  status: 'done',
});
const reads = [{ taskId: task.id, seenUpdatedAt: task.updatedAt }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.orgId = 'org-1';
  mocks.identity.userId = 'user-1';
  mocks.workspaceOrganizationId = 'workspace-a';
  mocks.get.mockResolvedValue({ id: 'org-1', reads: [], unreadCount: 1 });
  mocks.read.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
});
describe('workspace inbox read state', () => {
  it('treats unseen completed tasks as unread and later updates as unread again', () => {
    expect(isWorkspaceInboxTaskUnread(task, [])).toBe(true);
    expect(isWorkspaceInboxTaskUnread(task, undefined)).toBe(true);
    expect(isWorkspaceInboxTaskUnread(task, null)).toBe(true);
    expect(isWorkspaceInboxTaskUnread(task, reads)).toBe(false);
    expect(
      isWorkspaceInboxTaskUnread(
        new Task({ ...task, updatedAt: '2026-10-05T10:01:00.000Z' }),
        reads,
      ),
    ).toBe(true);
  });
  it('saves the displayed version and shares it with navigation consumers', async () => {
    const { result } = renderHook(
      () => ({ page: useWorkspaceInboxRead(), menu: useWorkspaceInboxRead() }),
      { wrapper: createQueryWrapper() },
    );
    await waitFor(() => expect(result.current.page.state.isSuccess).toBe(true));
    mocks.get.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
    await act(async () => {
      await result.current.page.read.mutateAsync([task]);
    });
    expect(mocks.read).toHaveBeenCalledWith(reads);
    await waitFor(() => expect(result.current.menu.isUnread(task)).toBe(false));
  });
  it('marks the entire inbox read through the server rather than just the loaded page', async () => {
    mocks.readAll.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
    mocks.get.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
    const { result } = renderHook(() => useWorkspaceInboxRead(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    await act(async () => {
      await result.current.read.mutateAsync(null);
    });
    expect(mocks.readAll).toHaveBeenCalledTimes(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('loads read state when the session has no active organization', async () => {
    mocks.identity.orgId = null;
    const { result } = renderHook(() => useWorkspaceInboxRead(), {
      wrapper: createQueryWrapper(),
    });
    expect(result.current.isUnread(task)).toBe(false);
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(result.current.isUnread(task)).toBe(true);
  });
  it('keeps the inbox mounted when a loaded read state omits reads', async () => {
    mocks.get.mockResolvedValue({ id: 'org-1', unreadCount: 2 });
    const { result } = renderHook(() => useWorkspaceInboxRead(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(result.current.isUnread(task)).toBe(true);
  });
  it('keeps rows unread after a failed write', async () => {
    mocks.read.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useWorkspaceInboxRead(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    await act(async () => {
      await expect(result.current.read.mutateAsync([task])).rejects.toThrow(
        'offline',
      );
    });
    expect(result.current.isUnread(task)).toBe(true);
    await waitFor(() => expect(result.current.read.isError).toBe(true));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
function createHarness() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: 300_000, retry: false, staleTime: 30_000 },
    },
  });
  clients.push(client);
  function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return { client, wrapper };
}
function currentKey() {
  return [
    'workspace-inbox-read',
    mocks.identity.userId,
    mocks.identity.orgId || mocks.workspaceOrganizationId || 'session',
  ];
}
function countedReceipts(size: number) {
  let visits = 0;
  return {
    reads: Array.from({ length: size }, (_, index) => ({
      get taskId() {
        visits++;
        return `task-${index}`;
      },
      seenUpdatedAt: '2026-10-05T10:00:00.000Z',
    })),
    reset: () => {
      visits = 0;
    },
    visits: () => visits,
  };
}
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
});

const semanticCases = [
  { name: 'undefined reads', reads: undefined, expected: true },
  { name: 'null reads', reads: null, expected: true },
  {
    name: 'non-array partial payload',
    reads: {} as IWorkspaceInboxRead[],
    expected: true,
  },
  { name: 'empty receipts', reads: [], expected: true },
  {
    name: 'unknown task',
    reads: [{ taskId: 'other', seenUpdatedAt: task.updatedAt }],
    expected: true,
  },
  {
    name: 'empty seen version',
    reads: [{ taskId: task.id, seenUpdatedAt: '' }],
    expected: true,
  },
  { name: 'equal version', reads, expected: false },
  {
    name: 'newer seen version',
    reads: [{ taskId: task.id, seenUpdatedAt: '2026-10-05T10:01:00.000Z' }],
    expected: false,
  },
  {
    name: 'older seen version',
    reads: [{ taskId: task.id, seenUpdatedAt: '2026-10-05T09:59:00.000Z' }],
    expected: true,
  },
  {
    name: 'invalid seen date',
    reads: [{ taskId: task.id, seenUpdatedAt: 'not-a-date' }],
    expected: false,
  },
  {
    name: 'invalid task date',
    reads,
    task: new Task({ ...task, updatedAt: 'not-a-date' }),
    expected: false,
  },
  {
    name: 'createdAt fallback',
    reads,
    task: new Task({
      ...task,
      updatedAt: undefined,
      createdAt: '2026-10-05T10:01:00.000Z',
    }),
    expected: true,
  },
  {
    name: 'first duplicate wins',
    reads: [
      reads[0],
      { taskId: task.id, seenUpdatedAt: '2026-10-05T09:59:00.000Z' },
    ],
    expected: false,
  },
  {
    name: 'falsey first duplicate wins',
    reads: [{ taskId: task.id, seenUpdatedAt: '' }, reads[0]],
    expected: true,
  },
  {
    name: 'invalid first duplicate wins',
    reads: [
      { taskId: task.id, seenUpdatedAt: 'invalid' },
      { taskId: task.id, seenUpdatedAt: '2026-10-05T09:59:00.000Z' },
    ],
    expected: false,
  },
];

describe('workspace inbox indexed unread lookup', () => {
  it.each(semanticCases)(
    'preserves standalone and hook semantics for $name',
    async (scenario) => {
      const inputTask = scenario.task ?? task;
      mocks.get.mockResolvedValue({
        id: 'org-1',
        reads: scenario.reads,
        unreadCount: 1,
      });
      const { result } = renderHook(useWorkspaceInboxRead, createHarness());
      expect(result.current.isUnread(inputTask)).toBe(false);
      await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
      expect(isWorkspaceInboxTaskUnread(inputTask, scenario.reads)).toBe(
        scenario.expected,
      );
      expect(result.current.isUnread(inputTask)).toBe(scenario.expected);
    },
  );

  it.each([
    { tasks: 10, receipts: 128, comparisons: 3705 },
    { tasks: 96, receipts: 256, comparisons: 60048 },
  ])(
    'indexes once for $tasks tasks, $receipts receipts and three classification passes',
    async (size) => {
      const counted = countedReceipts(size.receipts);
      const tasks = Array.from(
        { length: size.tasks },
        (_, index) =>
          new Task({
            ...task,
            id: `task-${size.receipts - size.tasks + index}`,
          }),
      );
      mocks.get.mockResolvedValue({
        id: 'org-1',
        reads: counted.reads,
        unreadCount: 0,
      });
      const { result } = renderHook(useWorkspaceInboxRead, createHarness());
      await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
      counted.reset();
      const actual: boolean[] = [];
      for (let pass = 0; pass < 3; pass++)
        for (const row of tasks) actual.push(result.current.isUnread(row));
      const indexedVisits = counted.visits();
      counted.reset();
      const expected: boolean[] = [];
      for (let pass = 0; pass < 3; pass++)
        for (const row of tasks)
          expected.push(isWorkspaceInboxTaskUnread(row, counted.reads));
      expect(counted.visits()).toBe(size.comparisons);
      expect(actual).toEqual(expected);
      expect(indexedVisits).toBeLessThanOrEqual(size.receipts);
    },
  );

  it('does not build an unused receipt index for count-only consumers', async () => {
    const counted = countedReceipts(128);
    mocks.get.mockResolvedValue({
      id: 'org-1',
      reads: counted.reads,
      unreadCount: 52,
    });
    const { result, rerender } = renderHook(
      useWorkspaceInboxCount,
      createHarness(),
    );
    await waitFor(() => expect(result.current).toBe(52));
    rerender();
    expect(counted.visits()).toBe(0);
  });

  it('does not mutate or reorder frozen receipt data', async () => {
    const frozen = Object.freeze([
      Object.freeze({ taskId: 'z', seenUpdatedAt: task.updatedAt }),
      Object.freeze(reads[0]),
    ]);
    mocks.get.mockResolvedValue({ id: 'org-1', reads: frozen, unreadCount: 0 });
    const { result } = renderHook(useWorkspaceInboxRead, createHarness());
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(result.current.isUnread(task)).toBe(false);
    expect(frozen.map((row) => row.taskId)).toEqual(['z', task.id]);
  });

  it('retains the predicate and built index on unrelated counter/fetching/mutation rerenders', async () => {
    const counted = countedReceipts(128);
    const saved = { id: 'org-1', reads: counted.reads, unreadCount: 0 };
    mocks.get.mockResolvedValue(saved);
    const { client, ...options } = createHarness();
    const { result, rerender } = renderHook(() => {
      const inbox = useWorkspaceInboxRead();
      return { ...inbox, isFetching: inbox.state.isFetching };
    }, options);
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    result.current.isUnread(new Task({ ...task, id: 'task-127' }));
    const predicate = result.current.isUnread;
    counted.reset();
    rerender();
    expect(result.current.isUnread).toBe(predicate);
    act(() =>
      client.setQueryData<IWorkspaceInboxReadState>(currentKey(), {
        ...saved,
        unreadCount: 4,
      }),
    );
    await waitFor(() => expect(result.current.state.data?.unreadCount).toBe(4));
    expect(result.current.isUnread).toBe(predicate);
    const refresh = deferred<typeof saved>();
    mocks.get.mockReturnValueOnce(refresh.promise);
    let refreshing!: Promise<unknown>;
    act(() => {
      refreshing = result.current.state.refetch();
    });
    await waitFor(() => expect(result.current.isFetching).toBe(true));
    expect(result.current.isUnread).toBe(predicate);
    await act(async () => {
      refresh.resolve(saved);
      await refreshing;
    });
    const write = deferred<typeof saved>();
    mocks.read.mockReturnValueOnce(write.promise);
    let writing!: Promise<unknown>;
    act(() => {
      writing = result.current.read.mutateAsync([task]);
    });
    await waitFor(() => expect(result.current.read.isPending).toBe(true));
    expect(result.current.isUnread).toBe(predicate);
    await act(async () => {
      write.resolve(saved);
      await writing;
    });
    expect(result.current.isUnread).toBe(predicate);
    result.current.isUnread(new Task({ ...task, id: 'task-127' }));
    expect(counted.visits()).toBe(0);
  });

  it('rebuilds lazily when a new receipt array arrives', async () => {
    const counted = countedReceipts(128);
    mocks.get.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
    const { client, ...options } = createHarness();
    const { result } = renderHook(useWorkspaceInboxRead, options);
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(result.current.isUnread(task)).toBe(false);
    const previous = result.current.isUnread;
    act(() =>
      client.setQueryData(currentKey(), {
        id: 'org-1',
        reads: counted.reads,
        unreadCount: 0,
      }),
    );
    await waitFor(() => expect(result.current.isUnread).not.toBe(previous));
    counted.reset();
    result.current.isUnread(new Task({ ...task, id: 'task-127' }));
    const firstVisits = counted.visits();
    result.current.isUnread(new Task({ ...task, id: 'task-127' }));
    expect(firstVisits).toBeGreaterThan(0);
    expect(counted.visits()).toBe(firstVisits);
  });

  it.each(['user', 'session organization', 'workspace organization'] as const)(
    'replaces the predicate/index when %s scope changes',
    async (change) => {
      if (change === 'workspace organization') mocks.identity.orgId = null;
      const counted = countedReceipts(128);
      const saved = { id: 'org-1', reads: counted.reads, unreadCount: 0 };
      mocks.get.mockResolvedValue(saved);
      const { client, ...options } = createHarness();
      const { result, rerender } = renderHook(useWorkspaceInboxRead, options);
      await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
      result.current.isUnread(new Task({ ...task, id: 'task-127' }));
      const previous = result.current.isUnread;
      if (change === 'user') mocks.identity.userId = 'user-2';
      if (change === 'session organization') mocks.identity.orgId = 'org-2';
      if (change === 'workspace organization')
        mocks.workspaceOrganizationId = 'workspace-b';
      client.setQueryData(currentKey(), saved);
      counted.reset();
      rerender();
      expect(result.current.isUnread).not.toBe(previous);
      expect(counted.visits()).toBe(0);
      result.current.isUnread(new Task({ ...task, id: 'task-127' }));
      const firstVisits = counted.visits();
      result.current.isUnread(new Task({ ...task, id: 'task-127' }));
      expect(counted.visits()).toBe(firstVisits);
    },
  );

  it('returns to the unloaded predicate and rebuilds after read-state reset', async () => {
    mocks.get.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
    const { client, ...options } = createHarness();
    const { result } = renderHook(useWorkspaceInboxRead, options);
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(result.current.isUnread(task)).toBe(false);
    const previous = result.current.isUnread;
    const pending = deferred<{
      id: string;
      reads: typeof reads;
      unreadCount: number;
    }>();
    mocks.get.mockReturnValueOnce(pending.promise);
    let reset!: Promise<void>;
    act(() => {
      reset = client.resetQueries({ queryKey: currentKey() });
    });
    await waitFor(() => expect(result.current.state.data).toBeUndefined());
    expect(result.current.isUnread).not.toBe(previous);
    expect(result.current.isUnread(task)).toBe(false);
    const unloaded = result.current.isUnread;
    await act(async () => {
      pending.resolve({ id: 'org-1', reads, unreadCount: 0 });
      await reset;
    });
    await waitFor(() => expect(result.current.state.isSuccess).toBe(true));
    expect(result.current.isUnread).not.toBe(unloaded);
    expect(result.current.isUnread(task)).toBe(false);
  });
});
