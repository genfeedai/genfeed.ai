import { act, renderHook, waitFor } from '@testing-library/react';
import {
  MODEL_FAVORITES_STORAGE_KEY,
  useModelFavorites,
} from '@ui/dropdowns/model-selector/useModelFavorites';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetUsersService,
  mockLoggerError,
  mockMutateUser,
  mockPatchSettings,
} = vi.hoisted(() => {
  const patchSettings = vi.fn();

  return {
    mockGetUsersService: vi.fn(async () => ({
      patchSettings,
    })),
    mockLoggerError: vi.fn(),
    mockMutateUser: vi.fn(),
    mockPatchSettings: patchSettings,
  };
});

let mockCurrentUser: {
  id: string;
  settings?: Record<string, unknown>;
} | null;

vi.mock('@genfeedai/contexts/user/user-context/user-context', () => ({
  useOptionalUser: () =>
    mockCurrentUser
      ? {
          currentUser: mockCurrentUser,
          mutateUser: mockMutateUser,
        }
      : undefined,
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetUsersService,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

describe('useModelFavorites', () => {
  beforeEach(() => {
    const storage = new Map<string, string>();

    mockCurrentUser = null;
    mockPatchSettings.mockReset();
    mockGetUsersService.mockClear();
    mockMutateUser.mockReset();
    mockLoggerError.mockReset();

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => {
          storage.delete(key);
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });
  });

  it('hydrates favorites from localStorage when no current user is available', async () => {
    globalThis.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(['model-a', 'model-b']),
    );

    const { result } = renderHook(() => useModelFavorites());

    await waitFor(() => {
      expect(result.current.favoriteModelKeys).toEqual(['model-a', 'model-b']);
    });
  });

  it('uses persisted user settings as the source of truth', async () => {
    globalThis.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(['stale-local-model']),
    );
    mockCurrentUser = {
      id: 'user-1',
      settings: {
        favoriteModelKeys: ['server-model'],
      },
    };

    const { result } = renderHook(() => useModelFavorites());

    await waitFor(() => {
      expect(result.current.favoriteModelKeys).toEqual(['server-model']);
    });

    expect(globalThis.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY)).toBe(
      JSON.stringify(['server-model']),
    );
  });

  it('persists toggled favorites to user settings and localStorage', async () => {
    mockCurrentUser = {
      id: 'user-1',
      settings: {
        favoriteModelKeys: [],
      },
    };

    const { result } = renderHook(() => useModelFavorites());

    act(() => {
      result.current.onFavoriteToggle('model-a');
    });

    await waitFor(() => {
      expect(result.current.favoriteModelKeys).toEqual(['model-a']);
    });

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-1', {
        favoriteModelKeys: ['model-a'],
      });
    });

    expect(mockMutateUser).toHaveBeenCalledTimes(1);
    expect(globalThis.localStorage.getItem(MODEL_FAVORITES_STORAGE_KEY)).toBe(
      JSON.stringify(['model-a']),
    );
  });

  it('migrates stored favorites into user settings when the field is absent', async () => {
    globalThis.localStorage.setItem(
      MODEL_FAVORITES_STORAGE_KEY,
      JSON.stringify(['legacy-model']),
    );
    mockCurrentUser = {
      id: 'user-1',
      settings: {},
    };

    const { result } = renderHook(() => useModelFavorites());

    await waitFor(() => {
      expect(result.current.favoriteModelKeys).toEqual(['legacy-model']);
    });

    await waitFor(() => {
      expect(mockPatchSettings).toHaveBeenCalledWith('user-1', {
        favoriteModelKeys: ['legacy-model'],
      });
    });
  });

  it('ignores malformed localStorage payloads', async () => {
    globalThis.localStorage.setItem(MODEL_FAVORITES_STORAGE_KEY, 'not-json');

    const { result } = renderHook(() => useModelFavorites());

    await waitFor(() => {
      expect(result.current.favoriteModelKeys).toEqual([]);
    });
  });
});
