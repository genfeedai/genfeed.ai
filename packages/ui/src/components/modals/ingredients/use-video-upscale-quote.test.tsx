import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoUpscaleQuote } from './use-video-upscale-quote';

const findUpscaleQuote = vi.fn();

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ findUpscaleQuote }),
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const request = {
  isEnabled: true,
  model: 'topazlabs/video-upscale',
  targetFps: 30,
  targetResolution: '1080p',
  videoId: 'video-1',
};

describe('useVideoUpscaleQuote', () => {
  beforeEach(() => {
    findUpscaleQuote.mockReset();
  });

  it('loads the price for the chosen options', async () => {
    findUpscaleQuote.mockResolvedValue({ credits: 1800 });

    const { result } = renderHook(() => useVideoUpscaleQuote(request));

    await waitFor(() =>
      expect(result.current).toEqual({ credits: 1800, isFailed: false }),
    );
    expect(findUpscaleQuote).toHaveBeenCalledWith(
      'video-1',
      {
        model: 'topazlabs/video-upscale',
        targetFps: 30,
        targetResolution: '1080p',
      },
      expect.any(AbortSignal),
    );
  });

  it('does not request anything while disabled', () => {
    const { result } = renderHook(() =>
      useVideoUpscaleQuote({ ...request, isEnabled: false }),
    );

    expect(result.current).toEqual({ credits: null, isFailed: false });
    expect(findUpscaleQuote).not.toHaveBeenCalled();
  });

  it('never shows the previous options price for the next options', async () => {
    findUpscaleQuote.mockResolvedValueOnce({ credits: 1800 });
    findUpscaleQuote.mockReturnValueOnce(new Promise(() => undefined));

    const { result, rerender } = renderHook(
      ({ targetResolution }) =>
        useVideoUpscaleQuote({ ...request, targetResolution }),
      { initialProps: { targetResolution: '1080p' } },
    );
    await waitFor(() => expect(result.current.credits).toBe(1800));

    rerender({ targetResolution: '4k' });

    expect(result.current).toEqual({ credits: null, isFailed: false });
  });

  it('reports a failed read instead of a price', async () => {
    findUpscaleQuote.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useVideoUpscaleQuote(request));

    await waitFor(() =>
      expect(result.current).toEqual({ credits: null, isFailed: true }),
    );
  });
});
