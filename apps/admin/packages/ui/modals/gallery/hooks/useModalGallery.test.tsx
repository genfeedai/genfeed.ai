import { IngredientCategory, IngredientFormat } from '@genfeedai/enums';
import { act, renderHook } from '@testing-library/react';
import { useModalGallery } from '@ui/modals/gallery/hooks/useModalGallery';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'test-brand-id',
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => () =>
    Promise.resolve({
      findAll: vi.fn(() => Promise.resolve([])),
    }),
}));

vi.mock('@services/content/pages.service', () => ({
  PagesService: {
    getCurrentPage: () => 1,
    getTotalPages: () => 1,
    setCurrentPage: vi.fn(),
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
    getInstance: () => ({
      error: vi.fn(),
    }),
  },
}));

vi.mock('@services/content/assets.service', () => ({
  AssetsService: {
    getInstance: () => ({
      findAll: vi.fn(() => Promise.resolve([])),
    }),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      findAll: vi.fn(() => Promise.resolve([])),
    }),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: () => ({
      findAll: vi.fn(() => Promise.resolve([])),
    }),
  },
}));

vi.mock('@services/ingredients/musics.service', () => ({
  MusicsService: {
    getInstance: () => ({
      findAll: vi.fn(() => Promise.resolve([])),
    }),
  },
}));

vi.mock('@genfeedai/constants', () => ({
  ITEMS_PER_PAGE: 12,
}));

describe.skip('useModalGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return initial state', () => {
    const { result } = renderHook(() =>
      useModalGallery({
        category: IngredientCategory.IMAGE,
        format: IngredientFormat.PORTRAIT,
        isOpen: false,
      }),
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.selectedItems).toEqual([]);
    expect(result.current.activeTab).toBe('media');
  });

  it('should initialize with provided format', () => {
    const { result } = renderHook(() =>
      useModalGallery({
        category: IngredientCategory.IMAGE,
        format: IngredientFormat.LANDSCAPE,
        isOpen: false,
      }),
    );

    expect(result.current.localFormat).toBe(IngredientFormat.LANDSCAPE);
  });

  it('should handle item selection', () => {
    const { result } = renderHook(() =>
      useModalGallery({
        category: IngredientCategory.IMAGE,
        format: IngredientFormat.PORTRAIT,
        isOpen: true,
      }),
    );

    const item = { height: 1920, id: 'img-1', width: 1080 };
    act(() => {
      result.current.handleItemSelect(item as never);
    });

    expect(result.current.selectedItems).toContain('img-1');
  });

  it('should remove item from selection when already selected', () => {
    const { result } = renderHook(() =>
      useModalGallery({
        category: IngredientCategory.IMAGE,
        format: IngredientFormat.PORTRAIT,
        isOpen: true,
      }),
    );

    const item = { height: 1920, id: 'img-1', width: 1080 };

    act(() => {
      result.current.handleItemSelect(item as never);
    });

    act(() => {
      result.current.handleItemSelect(item as never);
    });

    expect(result.current.selectedItems).not.toContain('img-1');
  });
});
