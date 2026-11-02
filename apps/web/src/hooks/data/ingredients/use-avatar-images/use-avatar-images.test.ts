import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindOrganizationIngredients = vi.fn();
const mockGetService = vi.fn();

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/organization/organizations.service', () => ({
  OrganizationsService: { getInstance: vi.fn() },
}));

vi.mock('@genfeedai/utils/media/ingredient-type.util', () => ({
  isAvatarSourceImageIngredient: (ingredient: { isAvatar?: boolean }) =>
    ingredient.isAvatar === true,
}));

import { useAvatarImages } from './use-avatar-images';

const AVATAR = { id: 'ing-1', isAvatar: true };
const NON_AVATAR = { id: 'ing-2', isAvatar: false };

describe('useAvatarImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindOrganizationIngredients.mockResolvedValue([AVATAR, NON_AVATAR]);
    mockGetService.mockResolvedValue({
      findOrganizationIngredients: mockFindOrganizationIngredients,
    });
  });

  it('loads and filters avatar ingredients for the organization', async () => {
    const { result } = renderHook(() => useAvatarImages('org-1'), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.avatars).toEqual([AVATAR]);
    });

    expect(mockFindOrganizationIngredients).toHaveBeenCalledWith(
      'org-1',
      {
        category: expect.any(String),
        limit: 100,
        sort: 'createdAt: -1',
      },
      expect.any(AbortSignal),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('returns an empty list without an organization id', async () => {
    const { result } = renderHook(() => useAvatarImages(undefined), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFindOrganizationIngredients).not.toHaveBeenCalled();
    expect(result.current.avatars).toEqual([]);
  });

  it('clears avatars when the fetch fails', async () => {
    mockFindOrganizationIngredients.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useAvatarImages('org-1'), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.avatars).toEqual([]);
  });

  it('refresh reloads the ingredients', async () => {
    const { result } = renderHook(() => useAvatarImages('org-1'), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.avatars).toEqual([AVATAR]);
    });

    const nextAvatar = { id: 'ing-3', isAvatar: true };
    mockFindOrganizationIngredients.mockResolvedValue([nextAvatar]);

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => {
      expect(result.current.avatars).toEqual([nextAvatar]);
    });
  });

  it('is loading, with no avatars, on the first render of a first visit', () => {
    mockFindOrganizationIngredients.mockReturnValue(new Promise(() => {}));
    const firstRender: { avatarCount: number; isLoading: boolean }[] = [];

    renderHook(
      () => {
        const state = useAvatarImages('org-1');
        firstRender.push({
          avatarCount: state.avatars.length,
          isLoading: state.isLoading,
        });
        return state;
      },
      { wrapper: queryClientWrapper() },
    );

    expect(firstRender[0]).toEqual({ avatarCount: 0, isLoading: true });
  });

  it('paints the cached avatars on a return visit without a loading state', async () => {
    const client = createTestQueryClient();
    const first = renderHook(() => useAvatarImages('org-1'), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() => expect(first.result.current.avatars).toEqual([AVATAR]));
    first.unmount();

    const firstRender: { avatars: unknown[]; isLoading: boolean }[] = [];
    renderHook(
      () => {
        const state = useAvatarImages('org-1');
        firstRender.push({
          avatars: state.avatars,
          isLoading: state.isLoading,
        });
        return state;
      },
      { wrapper: queryClientWrapper(client) },
    );

    expect(firstRender[0]).toEqual({ avatars: [AVATAR], isLoading: false });
  });
});
