import { DEFAULT_PLATFORM_FLAGS } from '@genfeedai/contracts/constants';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('usePlatformFlags (#5468)', () => {
  beforeEach(() => {
    publicService.getPlatformFlags.mockReset();
  });

  it('uses the server-rendered flags without a request', () => {
    const flags = { ...DEFAULT_PLATFORM_FLAGS, studio: false };

    const { result } = renderHook(() => usePlatformFlags(flags));

    expect(result.current).toEqual({ flags, isReady: true });
    expect(publicService.getPlatformFlags).not.toHaveBeenCalled();
  });

  it('reads the public endpoint when the shell has no flags', async () => {
    const flags = { ...DEFAULT_PLATFORM_FLAGS, desktop_local_workspace: false };
    publicService.getPlatformFlags.mockResolvedValue(flags);

    const { result } = renderHook(() => usePlatformFlags());

    expect(result.current.isReady).toBe(false);
    await waitFor(() =>
      expect(result.current).toEqual({ flags, isReady: true }),
    );
  });

  it('keeps every flag on when the API is unreachable', async () => {
    publicService.getPlatformFlags.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => usePlatformFlags());

    await waitFor(() =>
      expect(result.current).toEqual({
        flags: DEFAULT_PLATFORM_FLAGS,
        isReady: true,
      }),
    );
  });
});
