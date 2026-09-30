import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findAllMock = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findAll: findAllMock,
  }),
}));

vi.mock('@genfeedai/services/analytics/creative-patterns.service', () => ({
  CreativePatternsService: {
    getInstance: vi.fn(),
  },
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    findAllMock.mockResolvedValue([{ label: 'Hook' }]);
  });

  it('loads patterns from the Nest creative-patterns collection', async () => {
    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(findAllMock).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1' }),
      expect.any(AbortSignal),
    );
    expect(result.current.patterns).toEqual([{ label: 'Hook' }]);
    expect(result.current.error).toBeNull();
  });

  it('passes filters to the collection service', async () => {
    renderHook(() =>
      usePatternContext({
        patternType: 'hook_formula',
        platform: 'instagram',
        scope: 'public',
      }),
    );

    await waitFor(() => {
      expect(findAllMock).toHaveBeenCalled();
    });

    expect(findAllMock).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        patternType: 'hook_formula',
        platform: 'instagram',
        scope: 'public',
      },
      expect.any(AbortSignal),
    );
  });

  it('captures the error message when the fetch fails', async () => {
    findAllMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('network down');
  });

  it('uses a fallback message for non-error rejections', async () => {
    findAllMock.mockRejectedValue('boom');

    const { result } = renderHook(() => usePatternContext());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load patterns');
  });

  it('ignores abort errors on unmount', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    let rejectFind: ((reason: Error) => void) | undefined;
    findAllMock.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectFind = reject;
        }),
    );

    const { result, unmount } = renderHook(() => usePatternContext());

    unmount();
    rejectFind?.(abortError);
    await Promise.resolve();

    expect(result.current.error).toBeNull();
  });
});
