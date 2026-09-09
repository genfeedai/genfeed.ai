import { ActivityKey } from '@genfeedai/contracts';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  organizationId: 'org-1',
  userId: 'alice',
  connectionState: 'connected',
  recent: [] as IActivity[],
  active: [] as IActivity[],
  invalidate: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  push: vi.fn(),
  handlers: new Map<string, () => void>(),
}));
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brands: [{ id: 'brand-1', slug: 'coffee' }] }),
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
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'acme' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mock.invalidate }),
}));
vi.mock('@hooks/data/activities/use-activities/use-activities', () => ({
  useActivities: ({ activeOnly }: { activeOnly?: boolean }) => ({
    activities: activeOnly ? mock.active : mock.recent,
    filteredActivities: activeOnly ? mock.active : mock.recent,
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    isReady: true,
    connectionState: mock.connectionState,
    subscribe: (name: string, handler: () => void) => {
      mock.handlers.set(name, handler);
      return () => mock.handlers.delete(name);
    },
  }),
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ success: mock.success, warning: mock.warning }),
  },
}));
vi.mock('@/hooks/i18n/useActivityMessageFormatter', () => ({
  useActivityMessageFormatter: () => (descriptor: { key: string }) =>
    descriptor.key,
}));

import {
  ACTIVITY_RECONCILE_MS,
  useLiveActivityFeed,
} from './use-live-activity-feed';

function fixture(overrides: Partial<IActivity> = {}): IActivity {
  return {
    id: 'a1',
    userId: 'alice',
    organizationId: 'org-1',
    brandId: 'brand-1',
    entityId: 'image1',
    entityModel: 'Ingredient',
    key: ActivityKey.IMAGE_PROCESSING,
    value: '',
    createdAt: '2026-09-09T10:00:00Z',
    updatedAt: '2026-09-09T10:00:00Z',
    ...overrides,
  } as IActivity;
}
beforeEach(() => {
  vi.useFakeTimers();
  mock.organizationId = 'org-1';
  mock.userId = 'alice';
  mock.connectionState = 'connected';
  mock.recent = [];
  mock.active = [];
  mock.handlers.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
describe('live generation activity', () => {
  it('reads scoped durable records after socket updates and missed-event recovery', () => {
    mock.active = [fixture()];
    const { unmount } = renderHook(() => useLiveActivityFeed());
    mock.invalidate.mockClear();
    act(() => {
      mock.handlers.get('background-task-update')?.();
      mock.handlers.get('background-task-update')?.();
      vi.advanceTimersByTime(150);
    });
    expect(mock.invalidate).toHaveBeenCalledTimes(2);
    const predicate = mock.invalidate.mock.calls[0][0].predicate;
    expect(predicate({ queryKey: ['activities', 'alice', 'org-1'] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ['activities', 'bob', 'org-1'] })).toBe(false);
    expect(predicate({ queryKey: ['activities', 'alice', 'org-2'] })).toBe(
      false,
    );
    act(() => vi.advanceTimersByTime(ACTIVITY_RECONCILE_MS));
    expect(mock.invalidate).toHaveBeenCalledTimes(4);
    unmount();
    expect(mock.handlers.size).toBe(0);
  });
  it('stops polling once nothing is running and the socket is connected', () => {
    // The bell mounts on every page, so an unconditional interval polled the
    // activity and inbox endpoints forever.
    renderHook(() => useLiveActivityFeed());
    mock.invalidate.mockClear();
    act(() => vi.advanceTimersByTime(ACTIVITY_RECONCILE_MS * 4));
    expect(mock.invalidate).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('focus')));
    expect(mock.invalidate).toHaveBeenCalledTimes(2);
  });
  it('keeps polling while the socket cannot deliver updates', () => {
    mock.connectionState = 'disconnected';
    renderHook(() => useLiveActivityFeed());
    mock.invalidate.mockClear();
    act(() => vi.advanceTimersByTime(ACTIVITY_RECONCILE_MS));
    expect(mock.invalidate).toHaveBeenCalledTimes(2);
  });
  it('counts active jobs outside recent history and shows each own completion once', () => {
    mock.active = [fixture()];
    const { result, rerender } = renderHook(() => useLiveActivityFeed());
    expect(result.current.activeCount).toBe(1);
    expect(mock.success).not.toHaveBeenCalled();
    mock.active = [];
    mock.recent = [
      fixture({
        key: ActivityKey.IMAGE_GENERATED,
        updatedAt: '2026-09-09T10:01:00Z',
      }),
    ];
    rerender();
    expect(result.current.activeCount).toBe(0);
    expect(mock.success).toHaveBeenCalledTimes(1);
    mock.recent = [...mock.recent];
    rerender();
    expect(mock.success).toHaveBeenCalledTimes(1);
    mock.success.mock.calls[0][1].onAction();
    expect(mock.push).toHaveBeenCalledWith(
      '/acme/coffee/library/images?asset=image1',
    );
  });
  it('drops foreign organization rows and never notifies another recipient', () => {
    mock.active = [
      fixture({ userId: 'bob' }),
      fixture({ id: 'foreign', organizationId: 'org-2' }),
    ];
    const { result, rerender } = renderHook(() => useLiveActivityFeed());
    expect(result.current.activeCount).toBe(1);
    mock.active = [];
    mock.recent = [fixture({ userId: 'bob', key: ActivityKey.IMAGE_FAILED })];
    rerender();
    expect(mock.warning).not.toHaveBeenCalled();
    mock.organizationId = 'org-2';
    rerender();
    expect(result.current.filteredActivities).toEqual([]);
  });
});
