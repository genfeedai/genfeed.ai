import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPatchSettings = vi.fn();
const mockGetUsersService = vi.fn();
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
  useAuthedService: () => mockGetUsersService,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { useSidebarProgressPreference } from './use-sidebar-progress-preference';

const STORAGE_KEY = 'genfeed:sidebar:progress-visible:user-1';

function setCurrentUser(settings: Record<string, unknown> | undefined): void {
  mockUseCurrentUser.mockReturnValue({
    currentUser: { id: 'user-1', settings },
    mutateUser: mockMutateUser,
  });
}

function installInMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
    writable: true,
  });
}

describe('useSidebarProgressPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installInMemoryLocalStorage();
    mockPatchSettings.mockResolvedValue({});
    mockGetUsersService.mockResolvedValue({
      patchSettings: mockPatchSettings,
    });
    setCurrentUser(undefined);
  });

  it('defaults to visible with no stored or persisted preference', () => {
    const { result } = renderHook(() => useSidebarProgressPreference());

    expect(result.current.isVisible).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });

  it('reads the stored preference from localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false');

    const { result } = renderHook(() => useSidebarProgressPreference());

    expect(result.current.isVisible).toBe(false);
  });

  it('adopts the persisted user setting and mirrors it to localStorage', async () => {
    setCurrentUser({ isSidebarProgressVisible: false });

    const { result } = renderHook(() => useSidebarProgressPreference());

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('persists a new visibility preference', async () => {
    const { result } = renderHook(() => useSidebarProgressPreference());

    await act(async () => {
      await result.current.setVisibility(false);
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(mockMutateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ isSidebarProgressVisible: false }),
      }),
    );
    expect(mockPatchSettings).toHaveBeenCalledWith('user-1', {
      isSidebarProgressVisible: false,
    });
    expect(result.current.isVisible).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('hideProgress and showProgress toggle visibility', async () => {
    const { result } = renderHook(() => useSidebarProgressPreference());

    await act(async () => {
      await result.current.hideProgress();
    });
    expect(result.current.isVisible).toBe(false);

    await act(async () => {
      await result.current.showProgress();
    });
    expect(result.current.isVisible).toBe(true);
  });

  it('keeps the local preference when the server patch fails', async () => {
    mockPatchSettings.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSidebarProgressPreference());

    await act(async () => {
      await result.current.setVisibility(false);
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.isSaving).toBe(false);
  });

  it('skips server persistence when there is no current user', async () => {
    mockUseCurrentUser.mockReturnValue({
      currentUser: null,
      mutateUser: mockMutateUser,
    });

    const { result } = renderHook(() => useSidebarProgressPreference());

    await act(async () => {
      await result.current.setVisibility(false);
    });

    expect(mockPatchSettings).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(false);
  });
});
