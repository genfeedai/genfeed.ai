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

const logger = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@services/core/logger.service', () => ({ logger }));

const STUDIO_OFF = { ...DEFAULT_PLATFORM_FLAGS, studio: false };

describe('usePlatformFlags (#5468)', () => {
  beforeEach(() => {
    publicService.getPlatformFlags.mockReset();
    logger.warn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the server-rendered flags without a request', () => {
    const { result } = renderHook(() => usePlatformFlags(STUDIO_OFF));

    expect(result.current).toEqual({
      flags: STUDIO_OFF,
      isReady: true,
      isUnavailable: false,
    });
    expect(publicService.getPlatformFlags).not.toHaveBeenCalled();
  });

  it('reads the public endpoint when the shell has no flags', async () => {
    publicService.getPlatformFlags.mockResolvedValue(STUDIO_OFF);

    const { result } = renderHook(() => usePlatformFlags());

    expect(result.current.isReady).toBe(false);
    await waitFor(() =>
      expect(result.current).toEqual({
        flags: STUDIO_OFF,
        isReady: true,
        isUnavailable: false,
      }),
    );
  });

  it('stays unresolved with flags off when the initial read fails', async () => {
    publicService.getPlatformFlags.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => usePlatformFlags());

    expect(result.current.flags.studio).toBe(false);
    await waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(result.current.isReady).toBe(false);
    expect(result.current.isUnavailable).toBe(true);
    expect(Object.values(result.current.flags).some(Boolean)).toBe(false);
  });

  it('recovers the unresolved state on the next successful refresh', async () => {
    publicService.getPlatformFlags
      .mockRejectedValueOnce(new Error('503 unavailable'))
      .mockResolvedValue(STUDIO_OFF);
    const { result } = renderHook(() => usePlatformFlags());

    await waitFor(() => expect(logger.warn).toHaveBeenCalled());
    expect(result.current.isReady).toBe(false);
    act(() => notifyPlatformFlagsChanged());

    await waitFor(() =>
      expect(result.current).toEqual({
        flags: STUDIO_OFF,
        isReady: true,
        isUnavailable: false,
      }),
    );
  });

  it('ignores an older response after a newer refresh resolves', async () => {
    let resolveOlder: (flags: typeof DEFAULT_PLATFORM_FLAGS) => void = () =>
      undefined;
    publicService.getPlatformFlags
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOlder = resolve;
          }),
      )
      .mockResolvedValue(STUDIO_OFF);
    const { result } = renderHook(() => usePlatformFlags());

    act(() => notifyPlatformFlagsChanged());
    await waitFor(() => expect(result.current.flags.studio).toBe(false));
    await waitFor(() => expect(result.current.isReady).toBe(true));
    await act(async () => resolveOlder(DEFAULT_PLATFORM_FLAGS));

    expect(result.current).toEqual({
      flags: STUDIO_OFF,
      isReady: true,
      isUnavailable: false,
    });
  });

  it('uses newly supplied server flags and cancels the pending read', async () => {
    publicService.getPlatformFlags.mockImplementation(
      () => new Promise(() => undefined),
    );
    const { result, rerender } = renderHook(
      ({ flags }) => usePlatformFlags(flags),
      { initialProps: { flags: null as typeof DEFAULT_PLATFORM_FLAGS | null } },
    );
    const signal = publicService.getPlatformFlags.mock
      .calls[0]?.[0] as AbortSignal;

    rerender({ flags: STUDIO_OFF });

    expect(signal.aborted).toBe(true);
    expect(result.current).toEqual({
      flags: STUDIO_OFF,
      isReady: true,
      isUnavailable: false,
    });
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

  it('re-reads the flags at once after an Admin save', async () => {
    publicService.getPlatformFlags.mockResolvedValue(STUDIO_OFF);
    const { result } = renderHook(() =>
      usePlatformFlags(DEFAULT_PLATFORM_FLAGS),
    );

    act(() => notifyPlatformFlagsChanged());

    await waitFor(() => expect(result.current.flags.studio).toBe(false));
  });

  it('keeps the last flags when a later read fails', async () => {
    publicService.getPlatformFlags.mockRejectedValue(new Error('blip'));
    const { result } = renderHook(() => usePlatformFlags(STUDIO_OFF));

    act(() => notifyPlatformFlagsChanged());

    await waitFor(() =>
      expect(publicService.getPlatformFlags).toHaveBeenCalled(),
    );
    expect(result.current).toEqual({
      flags: STUDIO_OFF,
      isReady: true,
      isUnavailable: false,
    });
  });
});
