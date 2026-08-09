import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { usePatternContext } from './use-pattern-context';

describe('usePatternContext', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads patterns without filters', async () => {
    const patterns = [{ id: 'pattern-1' }];
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ docs: patterns }),
    });

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/creative-patterns?',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.patterns).toEqual(patterns);
    expect(result.current.error).toBeNull();
  });

  it('passes filters as query parameters', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ docs: [] }),
    });

    renderHook(() =>
      usePatternContext({
        patternType: 'hook',
        platform: 'instagram',
        scope: 'brand',
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('platform=instagram');
    expect(url).toContain('patternType=hook');
    expect(url).toContain('scope=brand');
  });

  it('defaults to an empty list when docs are missing', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({}),
    });

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.patterns).toEqual([]);
  });

  it('captures the error message when the fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('network down');
  });

  it('uses a fallback message for non-error rejections', async () => {
    fetchMock.mockRejectedValue('boom');

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load patterns');
  });

  it('ignores abort errors on unmount', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    let rejectFetch: ((reason: Error) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFetch = reject;
        }),
    );

    const { result, unmount } = renderHook(() => usePatternContext());

    unmount();
    rejectFetch?.(abortError);
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });
});
