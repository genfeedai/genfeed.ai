// @vitest-environment jsdom

import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { useAssetLoading } from '@pages/studio/generate/hooks/useAssetLoading';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetImagesService = vi.fn();
const mockGetVideosService = vi.fn();
const mockGetMusicsService = vi.fn();
const mockGetAvatarsService = vi.fn();
const imagesFindAllMock = vi.fn();
const avatarsFindAllMock = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((factory: (token: string) => unknown) => {
    const service = factory('test-token') as { __serviceType?: string };

    if (service.__serviceType === 'images') {
      return mockGetImagesService;
    }

    if (service.__serviceType === 'videos') {
      return mockGetVideosService;
    }

    if (service.__serviceType === 'avatars') {
      return mockGetAvatarsService;
    }

    return mockGetMusicsService;
  }),
}));

vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    getCurrentPage: vi.fn(() => 1),
    getTotalPages: vi.fn(() => 1),
    setCurrentPage: vi.fn(),
    setTotalPages: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
    })),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: vi.fn(() => ({
      __serviceType: 'images',
    })),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: vi.fn(() => ({
      __serviceType: 'videos',
    })),
  },
}));

vi.mock('@services/ingredients/musics.service', () => ({
  MusicsService: {
    getInstance: vi.fn(() => ({
      __serviceType: 'musics',
    })),
  },
}));

vi.mock('@services/ingredients/avatars.service', () => ({
  AvatarsService: {
    getInstance: vi.fn(() => ({
      __serviceType: 'avatars',
    })),
  },
}));

describe('useAssetLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imagesFindAllMock.mockResolvedValue([]);
    avatarsFindAllMock.mockResolvedValue([]);
    mockGetImagesService.mockResolvedValue({
      findAll: imagesFindAllMock,
    });
    mockGetVideosService.mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
    });
    mockGetMusicsService.mockResolvedValue({
      findAll: vi.fn().mockResolvedValue([]),
    });
    mockGetAvatarsService.mockResolvedValue({
      findAll: avatarsFindAllMock,
    });
  });

  it('does not send a format filter when the gallery filter is unset', async () => {
    const { result } = renderHook(() =>
      useAssetLoading({
        brandId: 'brand-1',
        categoryType: IngredientCategory.IMAGE,
        filtersRef: {
          current: {
            favorite: false,
            format: '',
            provider: '',
            search: '',
            sort: 'createdAt: -1',
            status: [
              IngredientStatus.PROCESSING,
              IngredientStatus.GENERATED,
              IngredientStatus.VALIDATED,
            ],
            type: '',
          },
        },
        isReady: true,
        stopAllMusic: vi.fn(),
        syncPlaybackState: (assets) => assets,
      }),
    );

    await result.current.findAllAssets();

    await waitFor(() => {
      expect(imagesFindAllMock).toHaveBeenCalledTimes(1);
    });

    const firstCallParams = imagesFindAllMock.mock.calls[0]?.[0] as {
      format?: string;
    };

    expect(firstCallParams.format).toBeUndefined();
  });

  it('sends the gallery format when the user explicitly filters by format', async () => {
    const { result } = renderHook(() =>
      useAssetLoading({
        brandId: 'brand-1',
        categoryType: IngredientCategory.IMAGE,
        filtersRef: {
          current: {
            favorite: false,
            format: 'landscape',
            provider: '',
            search: '',
            sort: 'createdAt: -1',
            status: [
              IngredientStatus.PROCESSING,
              IngredientStatus.GENERATED,
              IngredientStatus.VALIDATED,
            ],
            type: '',
          },
        },
        isReady: true,
        stopAllMusic: vi.fn(),
        syncPlaybackState: (assets) => assets,
      }),
    );

    await result.current.findAllAssets();

    await waitFor(() => {
      expect(imagesFindAllMock).toHaveBeenCalledTimes(1);
    });

    const firstCallParams = imagesFindAllMock.mock.calls[0]?.[0] as {
      format?: string;
    };

    expect(firstCallParams.format).toBe('landscape');
  });

  it('uses the avatars service for avatar assets', async () => {
    const { result } = renderHook(() =>
      useAssetLoading({
        brandId: 'brand-1',
        categoryType: IngredientCategory.AVATAR,
        filtersRef: {
          current: {
            favorite: false,
            format: '',
            provider: '',
            search: '',
            sort: 'createdAt: -1',
            status: [IngredientStatus.GENERATED],
            type: '',
          },
        },
        isReady: true,
        stopAllMusic: vi.fn(),
        syncPlaybackState: (assets) => assets,
      }),
    );

    await result.current.findAllAssets();

    await waitFor(() => {
      expect(avatarsFindAllMock).toHaveBeenCalledTimes(1);
    });

    expect(mockGetVideosService).not.toHaveBeenCalled();
    expect(avatarsFindAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        brand: 'brand-1',
        category: IngredientCategory.AVATAR,
      }),
    );
  });
});
