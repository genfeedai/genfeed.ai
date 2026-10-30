import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPatchMeSettings = vi.fn();
const mockMutateUser = vi.fn();
const mockUseCurrentUser = vi.fn();

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}));

vi.mock('@genfeedai/models/auth/user.model', () => ({
  User: class MockUser {
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    patchMeSettings: mockPatchMeSettings,
  }),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useAdvancedModePreference } from './use-advanced-mode-preference';

function setCurrentUser(settings: Record<string, unknown> | undefined): void {
  mockUseCurrentUser.mockReturnValue({
    currentUser:
      settings === undefined ? undefined : { id: 'user-1', settings },
    mutateUser: mockMutateUser,
  });
}

describe('useAdvancedModePreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatchMeSettings.mockResolvedValue({});
  });

  it('reads the saved preference', () => {
    setCurrentUser({ isAdvancedMode: true });
    const { result } = renderHook(() => useAdvancedModePreference());

    expect(result.current.isAdvancedMode).toBe(true);
    expect(result.current.isLoaded).toBe(true);
  });

  it('defaults to simple mode and reports not loaded before the user arrives', () => {
    setCurrentUser(undefined);
    const { result } = renderHook(() => useAdvancedModePreference());

    expect(result.current.isAdvancedMode).toBe(false);
    expect(result.current.isLoaded).toBe(false);
  });

  it('saves the new value optimistically', async () => {
    setCurrentUser({ isAdvancedMode: false });
    const { result } = renderHook(() => useAdvancedModePreference());

    await act(() => result.current.setAdvancedMode(true));

    expect(mockMutateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ isAdvancedMode: true }),
      }),
    );
    expect(mockPatchMeSettings).toHaveBeenCalledWith({ isAdvancedMode: true });
  });

  it('rolls back when the save fails', async () => {
    setCurrentUser({ isAdvancedMode: false });
    mockPatchMeSettings.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAdvancedModePreference());

    await act(() => result.current.setAdvancedMode(true));

    expect(mockMutateUser).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ isAdvancedMode: false }),
      }),
    );
  });
});
