import { useIngredientsActions } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-actions';
import { renderHook } from '@testing-library/react';
import { PageScope } from '@ui-constants/misc.constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => {
    const fn = vi.fn(() => ({
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
    return { default: fn, useIngredientActions: fn };
  },
);

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    isReady: false,
    subscribe: vi.fn(),
  })),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: vi.fn(() => ({ openConfirm: vi.fn() })),
  useIngredientOverlay: vi.fn(() => ({ openIngredientOverlay: vi.fn() })),
  usePostModal: vi.fn(() => ({ openPostBatchModal: vi.fn() })),
  useUploadModal: vi.fn(() => ({ openUpload: vi.fn() })),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatNumberWithCommas: vi.fn((n: number) => String(n)),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: vi.fn(),
}));

vi.mock('@utils/network/websocket.util', () => ({
  WebSocketPaths: { INGREDIENTS: '/ws/ingredients' },
}));

describe('useIngredientsActions', () => {
  const mockSetIngredients = vi.fn();
  const mockSetQuery = vi.fn();
  const mockFindAll = vi.fn().mockResolvedValue(undefined);
  const mockFindAllFolders = vi.fn().mockResolvedValue(undefined);
  const mockGetBulkService = vi.fn().mockResolvedValue({
    findAll: vi.fn().mockResolvedValue([]),
  });
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
  };
  const socketSubscriptionsRef = { current: [] as Array<() => void> };

  const baseProps = {
    brandId: 'brand-1',
    findAllFolders: mockFindAllFolders,
    findAllIngredientsByCategory: mockFindAll,
    formatFilter: undefined,
    getBulkIngredientsService: mockGetBulkService,
    ingredients: [],
    notificationsService: mockNotificationsService as never,
    onConvertToVideo: vi.fn(),
    pathname: '/manager/ingredients',
    query: {},
    router: { push: vi.fn(), replace: vi.fn() } as never,
    scope: PageScope.BRAND,
    searchParamsString: '',
    selectedFolderId: undefined,
    setIngredients: mockSetIngredients,
    setQuery: mockSetQuery,
    setSelectedFolderId: vi.fn(),
    singularType: 'video',
    socketSubscriptionsRef,
    type: 'videos',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns required fields', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    expect(result.current).toHaveProperty('selectedIngredientIds');
    expect(result.current).toHaveProperty('setSelectedIngredientIds');
    expect(result.current).toHaveProperty('handleDeleteIngredient');
    expect(result.current).toHaveProperty('handleBulkDelete');
    expect(result.current).toHaveProperty('handleClearSelection');
    expect(result.current).toHaveProperty('lightboxOpen');
    expect(result.current).toHaveProperty('openLightboxForIngredient');
    expect(result.current).toHaveProperty('handleRefresh');
  });

  it('initializes selectedIngredientIds as empty array', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    expect(result.current.selectedIngredientIds).toEqual([]);
  });

  it('initializes lightboxOpen as false', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    expect(result.current.lightboxOpen).toBe(false);
  });
});
