import {
  AssetScope,
  IngredientCategory,
  IngredientFormat,
  ModalEnum,
  PageScope,
  WebSocketEventStatus,
} from '@genfeedai/contracts';
import type { IFolder, IIngredient } from '@genfeedai/contracts/interfaces';
import { useIngredientsActions } from '@hooks/data/ingredients/use-ingredients-list/use-ingredients-actions';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ConfirmOptions {
  children?: unknown;
  confirmLabel?: string;
  label?: string;
  message?: string;
  onClose?: () => void;
  onConfirm: () => void | Promise<void>;
}

interface IngredientActionsOptions {
  onConvertToVideo: (ingredient: IIngredient) => void;
  onDeleteIngredient: (ingredient: IIngredient) => void;
  onPublishIngredient: (ingredient: IIngredient) => void;
  onRefresh: () => void;
  onReprompt: (ingredient: IIngredient) => void | Promise<void>;
  onSeeDetails: (ingredient: IIngredient) => void;
  onUpdateParent: (
    ingredient: IIngredient,
    parentId: string | null,
  ) => Promise<void>;
}

const {
  ingredientActionsHandlers,
  ingredientActionsState,
  mockClearUpscaleConfirm,
  mockExecuteUpscale,
  mockOpenConfirm,
  mockOpenIngredientOverlay,
  mockOpenModal,
  mockOpenPostBatchModal,
  mockOpenUpload,
  mockSubscribe,
  socketManagerState,
} = vi.hoisted(() => ({
  ingredientActionsHandlers: {
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
  ingredientActionsState: {
    lastOptions: null as IngredientActionsOptions | null,
    upscaleConfirmData: null as {
      cost: number;
      ingredient?: { category: IngredientCategory };
      modelKey?: string;
      videoModelOptions?: Array<{
        cost: number;
        fps: number[];
        key: string;
        label: string;
        resolutions: string[];
      }>;
    } | null,
  },
  mockClearUpscaleConfirm: vi.fn(),
  mockExecuteUpscale: vi.fn(),
  mockOpenConfirm: vi.fn(),
  mockOpenIngredientOverlay: vi.fn(),
  mockOpenModal: vi.fn(),
  mockOpenPostBatchModal: vi.fn(),
  mockOpenUpload: vi.fn(),
  mockSubscribe: vi.fn(),
  socketManagerState: { isReady: true },
}));

vi.mock(
  '@hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions',
  () => {
    const fn = vi.fn((options: IngredientActionsOptions) => {
      ingredientActionsState.lastOptions = options;
      return {
        clearUpscaleConfirm: mockClearUpscaleConfirm,
        executeUpscale: mockExecuteUpscale,
        handlers: ingredientActionsHandlers,
        loadingStates: {
          isGeneratingCaptions: false,
          isMirroring: false,
          isPortraiting: false,
          isReversing: false,
        },
        upscaleConfirmData: ingredientActionsState.upscaleConfirmData,
      };
    });
    return { default: fn, useIngredientActions: fn };
  },
);

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: vi.fn(() => ({
    isReady: socketManagerState.isReady,
    subscribe: mockSubscribe,
  })),
}));

const {
  mockImagesPost,
  mockImagesServiceInstance,
  mockIngredientsServiceDelete,
  mockIngredientsServiceInstance,
  mockPostMerge,
  mockVideosPost,
  mockVideosServiceInstance,
} = vi.hoisted(() => {
  const mockIngredientsServiceDelete = vi.fn();
  const mockPostMerge = vi.fn();
  const mockVideosPost = vi.fn();
  const mockImagesPost = vi.fn();

  return {
    mockImagesPost,
    mockImagesServiceInstance: { post: mockImagesPost },
    mockIngredientsServiceDelete,
    mockIngredientsServiceInstance: { delete: mockIngredientsServiceDelete },
    mockPostMerge,
    mockVideosPost,
    mockVideosServiceInstance: {
      post: mockVideosPost,
      postMerge: mockPostMerge,
    },
  };
});

const mockBulkPatch = vi.fn();
const mockBulkDelete = vi.fn();

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(
    (factory: (token: string) => unknown) => async () => factory('mock-token'),
  ),
}));

vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({
    useConfirmModal: vi.fn(() => ({ openConfirm: mockOpenConfirm })),
    useIngredientOverlay: vi.fn(() => ({
      openIngredientOverlay: mockOpenIngredientOverlay,
    })),
    usePostModal: vi.fn(() => ({
      openPostBatchModal: mockOpenPostBatchModal,
    })),
    useUploadModal: vi.fn(() => ({ openUpload: mockOpenUpload })),
  }),
);

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: {
    getInstance: vi.fn(() => mockIngredientsServiceInstance),
  },
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: vi.fn(() => mockVideosServiceInstance) },
}));

vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: { getInstance: vi.fn(() => mockImagesServiceInstance) },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatNumberWithCommas: vi.fn((n: number) => String(n)),
}));

vi.mock('@helpers/ui/modal/modal.helper', () => ({
  openModal: (...args: unknown[]) => mockOpenModal(...args),
}));

vi.mock('@genfeedai/utils/network/websocket.util', () => ({
  WebSocketPaths: {
    video: (id: string) => `/ws/videos/${id}`,
  },
}));

function createIngredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    category: IngredientCategory.VIDEO,
    id: 'ing-1',
    ...overrides,
  } as unknown as IIngredient;
}

describe('useIngredientsActions', () => {
  const mockSetIngredients = vi.fn();
  const mockSetQuery = vi.fn();
  const mockSetSelectedFolderId = vi.fn();
  const mockFindAll = vi.fn().mockResolvedValue(undefined);
  const mockFindAllFolders = vi.fn().mockResolvedValue(undefined);
  const mockRouterReplace = vi.fn();
  const mockGetBulkService = vi.fn();
  const mockNotificationsService = {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  };
  const socketSubscriptionsRef = { current: [] as Array<() => void> };
  const mockOnConvertToVideo = vi.fn();

  const baseProps = {
    brandId: 'brand-1',
    findAllFolders: mockFindAllFolders,
    findAllIngredientsByCategory: mockFindAll,
    formatFilter: undefined,
    getBulkIngredientsService: mockGetBulkService,
    ingredients: [],
    notificationsService: mockNotificationsService as never,
    onConvertToVideo: mockOnConvertToVideo,
    pathname: '/manager/ingredients',
    query: {},
    router: { push: vi.fn(), replace: mockRouterReplace } as never,
    scope: PageScope.BRAND,
    searchParamsString: '',
    selectedFolderId: undefined,
    setIngredients: mockSetIngredients,
    setQuery: mockSetQuery,
    setSelectedFolderId: mockSetSelectedFolderId,
    singularType: IngredientCategory.VIDEO,
    socketSubscriptionsRef,
    type: 'videos',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    ingredientActionsState.lastOptions = null;
    ingredientActionsState.upscaleConfirmData = null;
    socketManagerState.isReady = true;
    socketSubscriptionsRef.current = [];
    mockGetBulkService.mockResolvedValue({
      bulkDelete: mockBulkDelete,
      patch: mockBulkPatch,
    });
    mockBulkDelete.mockResolvedValue({
      deleted: ['ing-1'],
      failed: [],
      message: 'Deleted',
    });
    mockBulkPatch.mockResolvedValue({});
    mockPostMerge.mockResolvedValue({ id: 'video-1' });
    mockIngredientsServiceDelete.mockResolvedValue(undefined);
    mockImagesPost.mockResolvedValue({ id: 'image-2' });
    mockVideosPost.mockResolvedValue({ id: 'video-2' });
    mockSubscribe.mockReturnValue(vi.fn());
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
    expect(result.current.selectedIngredientIds).toEqual([]);
    expect(result.current.lightboxOpen).toBe(false);
  });

  it('confirms and deletes a single ingredient', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const ingredient = createIngredient();

    act(() => {
      result.current.handleDeleteIngredient(ingredient);
    });

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;
    expect(confirm.label).toBe('Delete Ingredient');

    await act(async () => {
      await confirm.onConfirm();
    });

    expect(mockIngredientsServiceDelete).toHaveBeenCalledWith('ing-1');
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Ingredient deleted successfully',
    );
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('notifies when single-ingredient delete fails', async () => {
    mockIngredientsServiceDelete.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.handleDeleteIngredient(createIngredient());
    });

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;

    await act(async () => {
      await confirm.onConfirm();
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to delete ingredient',
    );
  });

  it('updates the parent relationship optimistically', async () => {
    renderHook(() => useIngredientsActions(baseProps));

    const options = ingredientActionsState.lastOptions;
    expect(options).not.toBeNull();

    await act(async () => {
      await options?.onUpdateParent(createIngredient(), 'parent-1');
    });

    expect(mockBulkPatch).toHaveBeenCalledWith('ing-1', {
      parent: 'parent-1',
    });

    const optimisticUpdater = mockSetIngredients.mock.calls[0][0] as (
      prev: IIngredient[],
    ) => IIngredient[];
    const updated = optimisticUpdater([
      createIngredient(),
      createIngredient({ id: 'ing-2' }),
    ]);
    expect(updated[0].parent).toBe('parent-1');
    expect(updated[1].parent).toBeUndefined();
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('rolls back the parent update on failure', async () => {
    mockBulkPatch.mockRejectedValue(new Error('boom'));
    renderHook(() => useIngredientsActions(baseProps));

    const ingredient = createIngredient({ parent: 'old-parent' } as never);

    await act(async () => {
      await ingredientActionsState.lastOptions?.onUpdateParent(
        ingredient,
        'parent-1',
      );
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to update ingredient parent',
    );
    const rollbackUpdater = mockSetIngredients.mock.calls.at(-1)?.[0] as (
      prev: IIngredient[],
    ) => IIngredient[];
    const rolledBack = rollbackUpdater([createIngredient()]);
    expect(rolledBack[0].parent).toBe('old-parent');
  });

  it('skips parent updates that target the ingredient itself', async () => {
    renderHook(() => useIngredientsActions(baseProps));

    await act(async () => {
      await ingredientActionsState.lastOptions?.onUpdateParent(
        createIngredient(),
        'ing-1',
      );
    });

    expect(mockBulkPatch).not.toHaveBeenCalled();
  });

  it('opens the upscale confirm dialog when confirm data appears', async () => {
    ingredientActionsState.upscaleConfirmData = {
      cost: 1200,
      ingredient: { category: IngredientCategory.VIDEO },
    };
    mockExecuteUpscale.mockResolvedValue(undefined);

    renderHook(() => useIngredientsActions(baseProps));

    await waitFor(() => {
      expect(mockOpenConfirm).toHaveBeenCalled();
    });

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;
    expect(confirm.label).toBe('Confirm Upscale');
    expect(confirm.message).toContain('Choose the model');

    confirm.onClose?.();
    expect(mockClearUpscaleConfirm).toHaveBeenCalled();

    await act(async () => {
      await confirm.onConfirm();
    });
    expect(mockExecuteUpscale).toHaveBeenCalled();
  });

  it('bulk deletes the selected ingredients after confirmation', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1', 'ing-2']);
    });

    act(() => {
      result.current.handleBulkDelete();
    });

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;
    expect(confirm.label).toBe('Delete 2 Ingredients');

    mockBulkDelete.mockResolvedValue({
      deleted: ['ing-1', 'ing-2'],
      failed: [],
      message: 'Deleted 2',
    });

    await act(async () => {
      await confirm.onConfirm();
    });

    expect(mockBulkDelete).toHaveBeenCalledWith({
      ids: ['ing-1', 'ing-2'],
      type: 'ingredients-delete',
    });
    expect(mockNotificationsService.success).toHaveBeenCalledWith('Deleted 2');
    expect(result.current.selectedIngredientIds).toEqual([]);
  });

  it('reports partial bulk-delete failures', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1']);
    });
    act(() => {
      result.current.handleBulkDelete();
    });

    mockBulkDelete.mockResolvedValue({
      deleted: [],
      failed: ['ing-1'],
    });

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;
    await act(async () => {
      await confirm.onConfirm();
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to delete 1 ingredient(s). You may not have permission to delete them.',
    );
  });

  it('notifies when bulk delete throws', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1']);
    });
    act(() => {
      result.current.handleBulkDelete();
    });

    mockBulkDelete.mockRejectedValue(new Error('boom'));

    const confirm = mockOpenConfirm.mock.calls[0][0] as ConfirmOptions;
    await act(async () => {
      await confirm.onConfirm();
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to delete selected ingredients',
    );
  });

  it('does not open the bulk-delete confirm with no selection', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.handleBulkDelete();
    });

    expect(mockOpenConfirm).not.toHaveBeenCalled();
  });

  it('selects a folder and syncs the url', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const folder = { id: 'folder-1' } as unknown as IFolder;

    act(() => {
      result.current.handleSelectFolder(folder);
    });

    expect(mockSetQuery).toHaveBeenCalledWith({ folder: 'folder-1' });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      '/manager/ingredients?folder=folder-1',
      { scroll: false },
    );

    const folderUpdater = mockSetSelectedFolderId.mock.calls[0][0] as (
      prev: string | undefined,
    ) => string | undefined;
    expect(folderUpdater(undefined)).toBe('folder-1');
    expect(folderUpdater('folder-1')).toBe('folder-1');
  });

  it('clears the folder selection', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.handleSelectFolder(null);
    });

    expect(mockSetQuery).toHaveBeenCalledWith({ folder: undefined });
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it('moves an ingredient into a folder optimistically', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const folder = { id: 'folder-1' } as unknown as IFolder;

    await act(async () => {
      await result.current.handleFolderDrop(createIngredient(), folder);
    });

    expect(mockBulkPatch).toHaveBeenCalledWith('ing-1', {
      folderId: 'folder-1',
    });
    const optimisticUpdater = mockSetIngredients.mock.calls[0][0] as (
      prev: IIngredient[],
    ) => IIngredient[];
    expect(optimisticUpdater([createIngredient()])[0].folder).toBe('folder-1');
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('rolls back a failed folder move', async () => {
    mockBulkPatch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const ingredient = createIngredient({ folder: 'old-folder' } as never);

    await act(async () => {
      await result.current.handleFolderDrop(ingredient, {
        id: 'folder-1',
      } as unknown as IFolder);
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to move ingredient to folder',
    );
    const rollbackUpdater = mockSetIngredients.mock.calls.at(-1)?.[0] as (
      prev: IIngredient[],
    ) => IIngredient[];
    expect(rollbackUpdater([createIngredient()])[0].folder).toBe('old-folder');
  });

  it('opens the folder modal for creation and confirms', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.handleCreateFolder();
    });
    expect(mockOpenModal).toHaveBeenCalledWith(ModalEnum.FOLDER);

    act(() => {
      result.current.handleFolderModalConfirm(true);
    });
    expect(mockFindAllFolders).toHaveBeenCalled();
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('routes openIngredientModal by modal id', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const ingredient = createIngredient();

    act(() => {
      result.current.openIngredientModal(ModalEnum.INGREDIENT, ingredient);
    });
    expect(mockOpenIngredientOverlay).toHaveBeenCalledWith(
      ingredient,
      expect.any(Function),
    );

    act(() => {
      result.current.openIngredientModal(ModalEnum.POST, ingredient);
    });
    expect(mockOpenPostBatchModal).toHaveBeenCalledWith(ingredient);

    act(() => {
      result.current.openIngredientModal(ModalEnum.CONFIRM, ingredient);
    });
    expect(mockOpenConfirm).toHaveBeenCalled();

    act(() => {
      result.current.openIngredientModal(ModalEnum.UPLOAD);
    });
    expect(mockOpenUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        category: IngredientCategory.VIDEO,
        parentId: 'brand-1',
        parentModel: 'Brand',
      }),
    );

    act(() => {
      result.current.openIngredientModal(ModalEnum.FOLDER);
    });
    expect(mockOpenModal).toHaveBeenCalledWith(ModalEnum.FOLDER);
  });

  it('omits the brand parent for superadmin uploads', () => {
    const { result } = renderHook(() =>
      useIngredientsActions({ ...baseProps, scope: PageScope.SUPERADMIN }),
    );

    act(() => {
      result.current.openIngredientModal(ModalEnum.UPLOAD);
    });

    expect(mockOpenUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: undefined,
        parentModel: undefined,
      }),
    );
  });

  it('requires at least two ingredients to merge', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    await act(async () => {
      await result.current.handleMerge();
    });

    expect(mockPostMerge).not.toHaveBeenCalled();
  });

  it('merges videos and resolves via websocket completion', async () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1', 'ing-2']);
    });

    await act(async () => {
      await result.current.handleMerge();
    });

    expect(mockPostMerge).toHaveBeenCalledWith({
      category: IngredientCategory.VIDEO,
      ids: ['ing-1', 'ing-2'],
    });
    expect(mockSubscribe).toHaveBeenCalledWith(
      '/ws/videos/video-1',
      expect.any(Function),
    );
    expect(socketSubscriptionsRef.current).toContain(unsubscribe);
    expect(result.current.selectedIngredientIds).toEqual([]);

    const handler = mockSubscribe.mock.calls[0][1] as (data: {
      status: WebSocketEventStatus;
    }) => void;

    act(() => {
      handler({ status: WebSocketEventStatus.COMPLETED });
    });

    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Videos merged successfully!',
    );
    expect(result.current.isMerging).toBe(false);
    expect(unsubscribe).toHaveBeenCalled();
    expect(socketSubscriptionsRef.current).not.toContain(unsubscribe);
  });

  it('reports websocket merge failures', async () => {
    const unsubscribe = vi.fn();
    mockSubscribe.mockReturnValue(unsubscribe);
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1', 'ing-2']);
    });

    await act(async () => {
      await result.current.handleMerge();
    });

    const handler = mockSubscribe.mock.calls[0][1] as (data: {
      status: WebSocketEventStatus;
    }) => void;

    act(() => {
      handler({ status: WebSocketEventStatus.FAILED });
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Video merge failed',
    );
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('notifies when the merge request fails', async () => {
    mockPostMerge.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1', 'ing-2']);
    });

    await act(async () => {
      await result.current.handleMerge();
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to merge videos',
    );
    expect(result.current.isMerging).toBe(false);
  });

  it('clears the current selection', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    act(() => {
      result.current.setSelectedIngredientIds(['ing-1']);
    });
    act(() => {
      result.current.handleClearSelection();
    });

    expect(result.current.selectedIngredientIds).toEqual([]);
  });

  it('opens and closes the lightbox around a media ingredient', () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const media = [createIngredient(), createIngredient({ id: 'ing-2' })];

    let didOpen = false;
    act(() => {
      didOpen = result.current.openLightboxForIngredient(media[1], media);
    });

    expect(didOpen).toBe(true);
    expect(result.current.lightboxOpen).toBe(true);
    expect(result.current.lightboxIndex).toBe(1);

    act(() => {
      result.current.closeLightbox();
    });
    expect(result.current.lightboxOpen).toBe(false);

    let didOpenMissing = true;
    act(() => {
      didOpenMissing = result.current.openLightboxForIngredient(
        createIngredient({ id: 'missing' }),
        media,
      );
    });
    expect(didOpenMissing).toBe(false);
  });

  it('applies a scope change to a specific ingredient', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    await act(async () => {
      await result.current.handleScopeChange(
        AssetScope.ORGANIZATION,
        createIngredient(),
      );
    });

    const updater = mockSetIngredients.mock.calls[0][0] as (
      prev: IIngredient[],
    ) => IIngredient[];
    const updated = updater([createIngredient()]);
    expect(updated[0].scope).toBe(AssetScope.ORGANIZATION);
  });

  it('refetches on scope change without an updated ingredient', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));

    await act(async () => {
      await result.current.handleScopeChange(AssetScope.ORGANIZATION);
    });

    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('delegates simple handlers to useIngredientActions', async () => {
    const { result } = renderHook(() => useIngredientsActions(baseProps));
    const ingredient = createIngredient();

    await act(async () => {
      await result.current.handleArchiveIngredient(ingredient);
      await result.current.handleConvertToPortrait(ingredient);
      await result.current.handleGenerateCaptions(ingredient);
      await result.current.handleUpdateParent(ingredient, 'parent-1');
      result.current.handleSeeDetails(ingredient);
      await result.current.handleRefresh(true);
    });

    expect(ingredientActionsHandlers.handleMarkArchived).toHaveBeenCalledWith(
      ingredient,
    );
    expect(ingredientActionsHandlers.handlePortrait).toHaveBeenCalledWith(
      ingredient,
    );
    expect(
      ingredientActionsHandlers.handleGenerateCaptions,
    ).toHaveBeenCalledWith(ingredient);
    expect(ingredientActionsHandlers.handleUpdateParent).toHaveBeenCalledWith(
      ingredient,
      'parent-1',
    );
    expect(ingredientActionsHandlers.handleSeeDetails).toHaveBeenCalledWith(
      ingredient,
    );
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('reposts a rebuilt image generation payload on reprompt', async () => {
    renderHook(() => useIngredientsActions(baseProps));

    const ingredient = createIngredient({
      category: IngredientCategory.IMAGE,
      format: IngredientFormat.SQUARE,
      height: 1024,
      id: 'ing-image-1',
      modelUsed: 'flux-schnell',
      text: 'a neon cityscape at night',
      width: 1024,
    });

    await act(async () => {
      await ingredientActionsState.lastOptions?.onReprompt(ingredient);
    });

    expect(mockImagesPost).toHaveBeenCalledWith({
      category: IngredientCategory.IMAGE,
      format: IngredientFormat.SQUARE,
      height: 1024,
      model: 'flux-schnell',
      text: 'a neon cityscape at night',
      width: 1024,
    });
    expect(mockVideosPost).not.toHaveBeenCalled();
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Reprompt started',
    );
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('falls back to metadata dimensions and promptText for a video reprompt', async () => {
    renderHook(() => useIngredientsActions(baseProps));

    const ingredient = createIngredient({
      category: IngredientCategory.VIDEO,
      id: 'ing-video-1',
      metadataHeight: 720,
      metadataWidth: 1280,
      modelUsed: 'p-video',
      promptText: 'a drone shot of the coastline',
    });

    await act(async () => {
      await ingredientActionsState.lastOptions?.onReprompt(ingredient);
    });

    expect(mockVideosPost).toHaveBeenCalledWith({
      category: IngredientCategory.VIDEO,
      format: undefined,
      height: 720,
      model: 'p-video',
      text: 'a drone shot of the coastline',
      width: 1280,
    });
    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(mockNotificationsService.success).toHaveBeenCalledWith(
      'Reprompt started',
    );
    expect(mockFindAll).toHaveBeenCalledWith(true);
  });

  it('notifies without posting when the ingredient has no usable prompt', async () => {
    renderHook(() => useIngredientsActions(baseProps));

    const ingredient = createIngredient({
      category: IngredientCategory.IMAGE,
      id: 'ing-image-2',
      promptText: '   ',
      text: undefined,
    });

    await act(async () => {
      await ingredientActionsState.lastOptions?.onReprompt(ingredient);
    });

    expect(mockImagesPost).not.toHaveBeenCalled();
    expect(mockVideosPost).not.toHaveBeenCalled();
    expect(mockNotificationsService.warning).toHaveBeenCalledWith(
      'No prompt available to reprompt this ingredient',
    );
    expect(mockFindAll).not.toHaveBeenCalledWith(true);
  });

  it('notifies when the reprompt generation request fails', async () => {
    mockImagesPost.mockRejectedValue(new Error('boom'));
    renderHook(() => useIngredientsActions(baseProps));

    const ingredient = createIngredient({
      category: IngredientCategory.IMAGE,
      id: 'ing-image-3',
      text: 'a neon cityscape at night',
    });

    await act(async () => {
      await ingredientActionsState.lastOptions?.onReprompt(ingredient);
    });

    expect(mockNotificationsService.error).toHaveBeenCalledWith(
      'Failed to reprompt ingredient',
    );
  });
});
