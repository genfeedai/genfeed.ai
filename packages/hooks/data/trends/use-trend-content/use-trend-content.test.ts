import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTrendContent = vi.fn();
const mockGetService = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/social/trends.service', () => ({
  TrendsService: { getInstance: vi.fn() },
}));

import { useTrendContent } from './use-trend-content';

const ITEM = { id: 'trend-1', title: 'Trend' };
const SUMMARY = {
  connectedPlatforms: ['instagram'],
  lockedPlatforms: [],
  totalItems: 1,
  totalTrends: 1,
};

describe('useTrendContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrendContent.mockResolvedValue({
      items: [ITEM],
      summary: SUMMARY,
    });
    mockGetService.mockResolvedValue({
      getTrendContent: mockGetTrendContent,
    });
  });

  it('fetches trend content for the current brand', async () => {
    const { result } = renderHook(() => useTrendContent('instagram'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([ITEM]);
    });

    expect(mockGetTrendContent).toHaveBeenCalledWith({
      platform: 'instagram',
    });
    expect(result.current.summary).toEqual(SUMMARY);
    expect(result.current.error).toBeNull();
  });

  it('starts with empty initial data', () => {
    const { result } = renderHook(() => useTrendContent(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.items).toEqual([]);
    expect(result.current.summary.totalItems).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });

  it('refreshes trend content with the refresh flag', async () => {
    const { result } = renderHook(() => useTrendContent('tiktok'), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.items).toEqual([ITEM]);
    });

    const refreshedItem = { id: 'trend-2', title: 'New trend' };
    mockGetTrendContent.mockResolvedValue({
      items: [refreshedItem],
      summary: SUMMARY,
    });

    await act(async () => {
      await result.current.refreshTrendContent();
    });

    expect(mockGetTrendContent).toHaveBeenCalledWith({
      platform: 'tiktok',
    });
    await waitFor(() => {
      expect(result.current.items).toEqual([refreshedItem]);
    });
  });
});
