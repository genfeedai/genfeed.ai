import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/auth/use-auth-user/use-auth-user', () => ({
  useAuthUser: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(),
  },
}));

import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBrandSwitchHandler } from '@hooks/commands/use-brand-switch-handler/use-brand-switch-handler';

describe('useBrandSwitchHandler', () => {
  const mockPatchMeBrand = vi.fn();
  const mockReload = vi.fn();
  const mockGetUsersService = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPatchMeBrand.mockReset();
    mockReload.mockReset();
    mockGetUsersService.mockReset();
  });

  it('logs an error when user is not authenticated', async () => {
    (useAuthUser as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetUsersService,
    );

    const { result } = renderHook(() => useBrandSwitchHandler('brand-1'));

    await act(async () => {
      await result.current('brand-2');
    });

    expect(logger.error).toHaveBeenCalledWith(
      'Cannot switch brand: user not authenticated',
    );
    expect(mockGetUsersService).not.toHaveBeenCalled();
  });

  it('switches brand and calls onBrandChange', async () => {
    (useAuthUser as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { reload: mockReload },
    });

    mockGetUsersService.mockResolvedValue({
      patchMeBrand: mockPatchMeBrand,
    });

    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetUsersService,
    );

    const onBrandChange = vi.fn();
    const { result } = renderHook(() =>
      useBrandSwitchHandler('brand-1', onBrandChange),
    );

    await act(async () => {
      await result.current('brand-2');
    });

    expect(mockGetUsersService).toHaveBeenCalledTimes(1);
    expect(mockPatchMeBrand).toHaveBeenCalledWith('brand-2', {
      isSelected: true,
    });
    expect(mockReload).toHaveBeenCalled();
    expect(onBrandChange).toHaveBeenCalledWith('brand-2');
  });

  it('handles errors when switching brand', async () => {
    const error = new Error('Switch failed');

    (useAuthUser as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { reload: mockReload },
    });

    mockGetUsersService.mockResolvedValue({
      patchMeBrand: mockPatchMeBrand.mockRejectedValue(error),
    });

    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetUsersService,
    );

    const onBrandChange = vi.fn();
    const { result } = renderHook(() =>
      useBrandSwitchHandler('brand-1', onBrandChange),
    );

    await act(async () => {
      await result.current('brand-2');
    });

    expect(logger.error).toHaveBeenCalledWith('Failed to switch brand', error);
    expect(onBrandChange).not.toHaveBeenCalled();
  });
});
