import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  organizationId: 'alpha',
  userId: 'alice',
  service: {
    notificationInboxCount: vi.fn(),
    findNotificationInbox: vi.fn(),
    readNotificationInbox: vi.fn(),
  },
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => ({ userId: mock.userId, isSignedIn: true }),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => ({
    organizationId: mock.organizationId,
    isReady: true,
  }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => mock.service,
}));

import { useNotificationInbox } from './use-notification-inbox';

beforeEach(() => {
  mock.organizationId = 'alpha';
  mock.userId = 'alice';
  mock.service.notificationInboxCount.mockResolvedValue({
    id: 'alpha',
    unreadCount: 1,
  });
  mock.service.findNotificationInbox.mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  mock.service.readNotificationInbox.mockRejectedValue(
    new Error('database unavailable'),
  );
});

describe('useNotificationInbox', () => {
  it('preserves truthful unread count on failure and discards failed actions when recipient scope changes', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result, rerender } = renderHook(() => useNotificationInbox(true), {
      wrapper,
    });
    await waitFor(() => expect(result.current.count.data?.unreadCount).toBe(1));
    await act(async () => {
      await expect(result.current.read.mutateAsync(null)).rejects.toThrow(
        'database unavailable',
      );
    });
    await waitFor(() => expect(result.current.read.isError).toBe(true));
    expect(result.current.count.data?.unreadCount).toBe(1);
    mock.organizationId = 'bravo';
    mock.userId = 'bob';
    rerender();
    await waitFor(() => expect(result.current.read.isIdle).toBe(true));
    expect(result.current.read.variables).toBeUndefined();
    await waitFor(() =>
      expect(mock.service.findNotificationInbox).toHaveBeenCalledWith(
        'bravo',
        undefined,
        expect.any(AbortSignal),
      ),
    );
    client.clear();
  });
});
