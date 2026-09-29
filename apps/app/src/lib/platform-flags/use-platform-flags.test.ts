import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notifyPlatformFlagsChanged,
  PLATFORM_FLAGS_REFRESH_INTERVAL_MS,
} from './platform-flags-sync';
import { usePlatformFlags } from './use-platform-flags';

const publicService = vi.hoisted(() => ({
  getPlatformFlags: vi.fn(),
}));

vi.mock('@services/external/public.service', () => ({
  PublicService: { getInstance: () => publicService },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { warn: vi.fn() },
}));

const STUDIO_OFF = { ...DEFAULT_PLATFORM_FLAGS, studio: false };

describe('usePlatformFlags (#5468)', () => {
  beforeEach(() => {
    publicService.getPlatformFlags.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the public endpoint when the shell has no flags', async () => {
    publicService.getPlatformFlags.mockResolvedValue(STUDIO_OFF);

    const { result } = renderHook(() => usePlatformFlags());

    expect(result.current.isReady).toBe(false);
    await waitFor(() =>
      expect(result.current).toEqual({ flags: STUDIO_OFF, isReady: true }),
    );
  });

  it('re-reads the flags every minute', async () => {
    vi.useFakeTimers();
    publicService.getPlatformFlags.mockResolvedValue(STUDIO_OFF);
    const { result } = renderHook(() =>
      usePlatformFlags(DEFAULT_PLATFORM_FLAGS),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLATFORM_FLAGS_REFRESH_INTERVAL_MS);
    });

    expect(publicService.getPlatformFlags).toHaveBeenCalledTimes(1);
    expect(result.current.flags.studio).toBe(false);
  });

  it('keeps the last flags when a later read fails', async () => {
    publicService.getPlatformFlags.mockRejectedValue(new Error('blip'));
    const { result } = renderHook(() => usePlatformFlags(STUDIO_OFF));

    act(() => notifyPlatformFlagsChanged());

    await waitFor(() =>
      expect(publicService.getPlatformFlags).toHaveBeenCalled(),
    );
    expect(result.current).toEqual({ flags: STUDIO_OFF, isReady: true });
  });
});
