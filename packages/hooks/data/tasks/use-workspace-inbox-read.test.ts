import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { Task } from '@services/management/tasks.service';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  readAll: vi.fn(),
  identity: { userId: 'user-1', orgId: 'org-1', getToken: vi.fn() },
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
} from './use-workspace-inbox-read';

const task = new Task({
  id: 'task-1',
  updatedAt: '2026-10-05T10:00:00.000Z',
  status: 'done',
});
const reads = [{ taskId: task.id, seenUpdatedAt: task.updatedAt }];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ id: 'org-1', reads: [], unreadCount: 1 });
  mocks.read.mockResolvedValue({ id: 'org-1', reads, unreadCount: 0 });
});
describe('workspace inbox read state', () => {
  it('treats unseen completed tasks as unread and later updates as unread again', () => {
    expect(isWorkspaceInboxTaskUnread(task, [])).toBe(true);
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
    expect(result.current.read.isError).toBe(true);
  });
});
