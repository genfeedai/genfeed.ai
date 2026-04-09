import { IngredientCategory, PageScope } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { useIngredientsList } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-list';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSetQuery = vi.fn();
const mockSetIsRefreshing = vi.fn();
const mockOnRefresh = vi.fn();
const mockGetService = vi.fn();
const mockService = {
  delete: vi.fn().mockResolvedValue(undefined),
  findAll: vi.fn().mockResolvedValue([]),
  patch: vi.fn().mockResolvedValue(undefined),
  post: vi.fn().mockResolvedValue(undefined),
};

const _mockHandlers = {
  handleCopyPrompt: vi.fn(),
  handleGenerateCaptions: vi.fn(),
  handleMarkArchived: vi.fn(),
  handleMirror: vi.fn(),
  handlePortrait: vi.fn(),
  handleReprompt: vi.fn(),
  handleReverse: vi.fn(),
  handleSeeDetails: vi.fn(),
  handleUpdateParent: vi.fn(),
};

vi.mock(
  '@genfeedai/contexts/content/ingredients-context/ingredients-context',
  () => ({
    useIngredientsContext: vi.fn(() => ({
      filters: { format: 'all' },
      onRefresh: mockOnRefresh,
      query: {},
      setIsRefreshing: mockSetIsRefreshing,
      setQuery: mockSetQuery,
    })),
  }),
);

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
  })),
}));

vi.mock('@hooks/data/elements/use-elements/use-elements', () => ({
  useElements: vi.fn(() => ({
    blacklists: [],
    cameras: [],
    fontFamilies: [],
    moods: [],
    presets: [],
    sounds: [],
    styles: [],
    tags: [],
    videoModels: [{ key: 'model-1' }],
  })),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    isReady: false,
    subscribe: vi.fn(),
  })),
}));

vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => {
    const mockFn = vi.fn(() => ({
      clearUpscaleConfirm: vi.fn(),
      executeUpscale: vi.fn(),
      handlers: {
        handleCopyPrompt: vi.fn(),
        handleGenerateCaptions: vi.fn(),
        handleMarkArchived: vi.fn(),
        handleMirror: vi.fn(),
        handlePortrait: vi.fn(),
        handleReprompt: vi.fn(),
        handleReverse: vi.fn(),
        handleSeeDetails: vi.fn(),
        handleUpdateParent: vi.fn(),
      },
      loadingStates: {
        isGeneratingCaptions: false,
        isMirroring: false,
        isPortraiting: false,
        isReversing: false,
      },
      upscaleConfirmData: null,
    }));
    return {
      default: mockFn,
      useIngredientActions: mockFn,
    };
  },
);

vi.mock('@genfeedai/providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({ openConfirm: vi.fn() })),
  useIngredientOverlay: vi.fn(() => ({ openIngredientOverlay: vi.fn() })),
  usePostModal: vi.fn(() => ({ openPostBatchModal: vi.fn() })),
  useUploadModal: vi.fn(() => ({ openUpload: vi.fn() })),
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => ({
      error: vi.fn(),
      success: vi.fn(),
    })),
  },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/manager/ingredients'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
}));

vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    getValues: vi.fn(() => ({})),
  })),
}));

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';

describe('useIngredientsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetService.mockResolvedValue(mockService);
    (useAuthedService as ReturnType<typeof vi.fn>).mockReturnValue(
      mockGetService,
    );
  });

  it('returns basic state values', () => {
    const { result } = renderHook(() =>
      useIngredientsList({ scope: PageScope.BRAND, type: 'videos' }),
    );

    expect(result.current.type).toBe('videos');
    expect(result.current.singularType).toBe('video');
    expect(result.current.isActionsEnabled).toBe(true);
    expect(result.current.formatFilter).toBeUndefined();
  });

  it('clears filters via context setter', () => {
    const { result } = renderHook(() =>
      useIngredientsList({ scope: PageScope.BRAND, type: 'videos' }),
    );

    act(() => {
      result.current.clearFilters();
    });

    expect(mockSetQuery).toHaveBeenCalledWith({
      category: '',
      format: '',
      provider: '',
      search: '',
      status: '',
    });
  });

  it('clears selected ingredient ids', () => {
    const { result } = renderHook(() =>
      useIngredientsList({ scope: PageScope.BRAND, type: 'videos' }),
    );

    act(() => {
      result.current.setSelectedIngredientIds(['ingredient-1']);
    });

    act(() => {
      result.current.handleClearSelection();
    });

    expect(result.current.selectedIngredientIds).toEqual([]);
  });

  it('opens lightbox returns false when ingredient not in media list', () => {
    const { result } = renderHook(() =>
      useIngredientsList({ scope: PageScope.BRAND, type: 'videos' }),
    );

    const ingredient = {
      category: IngredientCategory.IMAGE,
      id: 'ingredient-not-in-list',
      ingredientUrl: 'https://cdn.genfeed.ai/item.png',
    } as IIngredient;

    // When ingredients are not loaded, openLightboxForIngredient returns false
    let opened = false;
    act(() => {
      opened = result.current.openLightboxForIngredient(ingredient);
    });

    expect(opened).toBe(false);
    expect(result.current.lightboxOpen).toBe(false);
  });
});
