import { useTwitterPipeline } from '@hooks/twitter/use-twitter-pipeline';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSearch = vi.fn();
const mockDraft = vi.fn();
const mockPublish = vi.fn();

vi.mock('@services/twitter/twitter-pipeline.service', () => ({
  TwitterPipelineService: {
    getInstance: vi.fn(() => ({
      draft: mockDraft,
      publish: mockPublish,
      search: mockSearch,
    })),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
    })),
  },
}));

describe('useTwitterPipeline', () => {
  const options = { brandId: 'brand-1', orgId: 'org-1', token: 'test-token' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue([{ id: 'r1', text: 'tweet result' }]);
    mockDraft.mockResolvedValue([{ id: 'op1', text: 'opportunity' }]);
    mockPublish.mockResolvedValue({ success: true, tweetId: 'tweet-123' });
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useTwitterPipeline(options));
    expect(result.current).toHaveProperty('search');
    expect(result.current).toHaveProperty('draft');
    expect(result.current).toHaveProperty('publish');
    expect(result.current).toHaveProperty('reset');
    expect(result.current).toHaveProperty('status');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
  });

  it('initializes with idle status and empty data', () => {
    const { result } = renderHook(() => useTwitterPipeline(options));
    expect(result.current.status).toBe('idle');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.opportunities).toEqual([]);
    expect(result.current.publishResult).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('search updates searchResults and sets status to ready', async () => {
    const { result } = renderHook(() => useTwitterPipeline(options));

    await act(async () => {
      await result.current.search({ platform: 'twitter' } as never);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0].id).toBe('r1');
  });

  it('draft updates opportunities and sets status to ready', async () => {
    const { result } = renderHook(() => useTwitterPipeline(options));

    await act(async () => {
      await result.current.draft({ platform: 'twitter' } as never, []);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.opportunities).toHaveLength(1);
  });

  it('publish sets publishResult and status to done', async () => {
    const { result } = renderHook(() => useTwitterPipeline(options));

    let publishReturn: unknown;
    await act(async () => {
      publishReturn = await result.current.publish({ tweetIds: [] } as never);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
    expect(publishReturn).toEqual({ success: true, tweetId: 'tweet-123' });
    expect(result.current.publishResult).toEqual({
      success: true,
      tweetId: 'tweet-123',
    });
  });

  it('reset clears all state and sets status to idle', async () => {
    const { result } = renderHook(() => useTwitterPipeline(options));

    await act(async () => {
      await result.current.search({ platform: 'twitter' } as never);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles search error', async () => {
    mockSearch.mockRejectedValue(new Error('Search failed'));

    const { result } = renderHook(() => useTwitterPipeline(options));

    await act(async () => {
      await result.current.search({ platform: 'twitter' } as never);
    });

    await waitFor(() => {
      expect(result.current.status).toBe('idle');
      expect(result.current.error).toBe('Search failed');
    });
  });
});
