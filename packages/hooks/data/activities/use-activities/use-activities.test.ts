import { useAuth } from '@clerk/nextjs';
import type { IActivity } from '@genfeedai/interfaces';
import { getPlaywrightAuthState } from '@helpers/auth/clerk.helper';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBulkPatch = vi.fn();
const mockPatch = vi.fn();
const mockRefresh = vi.fn();
const mockWithSilentOperation = vi.fn();
const mockGetActivitiesService = vi.fn();
const mockGetBrandsService = vi.fn();
const mockGetOrganizationsService = vi.fn();
const mockUseFilteredData = vi.fn();

vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ isLoaded: true, isSignedIn: true })),
  useUser: vi.fn(() => ({ user: null })),
}));

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@helpers/auth/clerk.helper', () => ({
  getClerkPublicData: vi.fn(() => ({ isSuperAdmin: false })),
  getPlaywrightAuthState: vi.fn(() => null),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((factory: (token: string) => unknown) => {
    const factoryStr = factory.toString();
    if (factoryStr.includes('ActivitiesService')) {
      return mockGetActivitiesService;
    }
    if (factoryStr.includes('BrandsService')) {
      return mockGetBrandsService;
    }
    if (factoryStr.includes('OrganizationsService')) {
      return mockGetOrganizationsService;
    }
    return vi.fn().mockResolvedValue({});
  }),
}));

vi.mock('@hooks/utils/use-filtered-data/use-filtered-data', () => ({
  useFilteredData: (...args: unknown[]) => mockUseFilteredData(...args),
}));

vi.mock('@hooks/utils/service-operation/service-operation.util', () => ({
  withSilentOperation: (...args: unknown[]) => mockWithSilentOperation(...args),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(),
  },
}));

describe('useActivities', () => {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activities: IActivity[] = [
    {
      createdAt: today.toISOString(),
      id: 'activity-1',
      isRead: false,
      key: 'alpha',
      value: 'created',
    } as IActivity,
    {
      createdAt: yesterday.toISOString(),
      id: 'activity-2',
      isRead: true,
      key: 'beta',
      value: 'updated',
    } as IActivity,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>);
    vi.mocked(getPlaywrightAuthState).mockReturnValue(null);
    mockBulkPatch.mockResolvedValue(undefined);
    mockPatch.mockResolvedValue(undefined);
    mockGetActivitiesService.mockResolvedValue({
      bulkPatch: mockBulkPatch,
      findAll: vi.fn().mockResolvedValue(activities),
      patch: mockPatch,
    });
    mockGetBrandsService.mockResolvedValue({
      findBrandActivities: vi.fn().mockResolvedValue(activities),
    });
    mockGetOrganizationsService.mockResolvedValue({
      findOrganizationActivities: vi.fn().mockResolvedValue(activities),
    });
    mockRefresh.mockResolvedValue(undefined);
    mockUseFilteredData.mockImplementation(
      ({ data }: { data: IActivity[] }) => data,
    );
    mockWithSilentOperation.mockImplementation(
      async ({
        operation,
        onSuccess,
      }: {
        operation: () => Promise<unknown>;
        onSuccess?: () => void;
      }) => {
        await operation();
        onSuccess?.();
      },
    );
  });

  it('returns activities and stats', async () => {
    const { result } = renderHook(() => useActivities(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activities).toEqual(activities);
    expect(result.current.activityStats.total).toBe(2);
    expect(result.current.activityStats.todayCount).toBe(1);
    expect(result.current.activityStats.statusCounts).toEqual({
      created: 1,
      updated: 1,
    });
  });

  it('updates filter state', async () => {
    const { result } = renderHook(() => useActivities({ initialFilter: '' }), {
      wrapper: createQueryWrapper(),
    });

    act(() => {
      result.current.setFilter('alpha');
    });

    expect(result.current.filter).toBe('alpha');
  });

  it('marks all unread activities as read', async () => {
    const { result } = renderHook(() => useActivities(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.markActivitiesAsRead();
    });

    expect(mockWithSilentOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to mark activities as read',
        url: 'PATCH /activities/bulk [1 activities]',
      }),
    );
    expect(mockBulkPatch).toHaveBeenCalledWith({
      ids: ['activity-1'],
      isRead: true,
      type: 'activity-bulk-patch',
    });
  });

  it('toggles activity read status', async () => {
    const { result } = renderHook(() => useActivities(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.toggleActivityRead('activity-1');
    });

    expect(mockWithSilentOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'Failed to update activity status',
        url: 'PATCH /activities/activity-1 [toggle read]',
      }),
    );
    expect(mockPatch).toHaveBeenCalledWith('activity-1', {
      id: 'activity-1',
      isRead: true,
    });
  });

  it('does not fetch activities before auth is ready', () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
    } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useActivities(), {
      wrapper: createQueryWrapper(),
    });

    // When auth is not ready the query is disabled — activities should be empty
    expect(result.current.activities).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
