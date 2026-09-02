import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bulkDelete: vi.fn(),
  copyToClipboard: vi.fn(),
  notificationsError: vi.fn(),
  notificationsInfo: vi.fn(),
  notificationsSuccess: vi.fn(),
  openConfirm: vi.fn(),
  openIngredientOverlay: vi.fn(),
  openPostBatchModal: vi.fn(),
  patch: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    bulkDelete: mocks.bulkDelete,
    patch: mocks.patch,
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: mocks.openConfirm }),
  useIngredientOverlay: () => ({
    openIngredientOverlay: mocks.openIngredientOverlay,
  }),
  usePostModal: () => ({ openPostBatchModal: mocks.openPostBatchModal }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/default/default${path}` }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn() },
}));

vi.mock('@services/core/clipboard.service', () => ({
  ClipboardService: {
    getInstance: () => ({ copyToClipboard: mocks.copyToClipboard }),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.notificationsError,
      info: mocks.notificationsInfo,
      success: mocks.notificationsSuccess,
    }),
  },
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../apps/app/tests/next-intl.stub'
  );

  return { useTranslations: translateFromCatalog };
});

import { useStudioGenerateAssetActions } from './useStudioGenerateAssetActions';

const ingredient = {
  category: IngredientCategory.IMAGE,
  id: 'ingredient-1',
  isFavorite: false,
  promptText: 'A clean product photograph',
  status: IngredientStatus.GENERATED,
} as IIngredient;

describe('useStudioGenerateAssetActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bulkDelete.mockResolvedValue({
      deleted: [ingredient.id],
      failed: [],
      message: 'Successfully deleted 1 ingredient(s)',
    });
    mocks.copyToClipboard.mockResolvedValue(undefined);
    mocks.patch.mockResolvedValue(undefined);
  });

  it('reconnects gallery assets to details, publishing, and the composer', () => {
    const onAttachReference = vi.fn();
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({ onAttachReference, onRefresh }),
    );

    act(() => result.current.onClickIngredient(ingredient));
    act(() => result.current.onPublishIngredient(ingredient));
    act(() => result.current.onCreateVariation(ingredient));
    act(() => result.current.onConvertToVideo(ingredient));
    act(() => result.current.onUseAsVideoReference(ingredient));

    expect(mocks.openIngredientOverlay).toHaveBeenCalledWith(
      ingredient,
      onRefresh,
    );
    expect(mocks.openPostBatchModal).toHaveBeenCalledWith(ingredient);
    expect(onAttachReference).toHaveBeenNthCalledWith(1, ingredient, 'image');
    expect(onAttachReference).toHaveBeenNthCalledWith(2, ingredient, 'video');
    expect(mocks.push).toHaveBeenCalledWith(
      '/default/default/studio/storyboard?mode=scenes&referenceImageId=ingredient-1&format=portrait',
    );
  });

  it('copies prompts and persists favorite and review status changes', async () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({
        onAttachReference: vi.fn(),
        onRefresh,
      }),
    );

    await act(async () => {
      await result.current.onCopyPrompt(ingredient);
      await result.current.onToggleFavorite(ingredient);
      await result.current.onMarkValidated(ingredient);
    });

    expect(mocks.copyToClipboard).toHaveBeenCalledWith(ingredient.promptText);
    expect(mocks.patch).toHaveBeenNthCalledWith(1, ingredient.id, {
      isFavorite: true,
    });
    expect(mocks.patch).toHaveBeenNthCalledWith(2, ingredient.id, {
      status: IngredientStatus.VALIDATED,
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('confirms deletion before removing an ingredient', async () => {
    const onDeleted = vi.fn();
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({
        onAttachReference: vi.fn(),
        onDeleted,
        onRefresh,
      }),
    );

    act(() => result.current.onDeleteIngredient(ingredient));

    const confirm = mocks.openConfirm.mock.calls.at(-1)?.[0] as {
      confirmLabel: string;
      isError: boolean;
      message: string;
      onConfirm: () => Promise<void>;
    };
    expect(confirm).toMatchObject({
      confirmLabel: 'Delete',
      isError: true,
      message: 'Move this ingredient to Trash? You can restore it later.',
    });

    await act(confirm.onConfirm);

    expect(mocks.bulkDelete).toHaveBeenCalledWith({
      ids: [ingredient.id],
      type: 'ingredients-delete',
    });
    expect(onDeleted).toHaveBeenCalledWith(ingredient.id);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(mocks.notificationsSuccess).toHaveBeenCalledWith('Moved to Trash');
  });

  it('removes a client-only failed generation without calling the API', async () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({
        onAttachReference: vi.fn(),
        onDeleted,
        onRefresh: vi.fn(),
      }),
    );
    const failedJob = {
      createdAt: 1,
      id: 'failed-local',
      prompt: 'A failed prompt',
      status: IngredientStatus.FAILED,
      type: 'image' as const,
    };

    act(() => result.current.onRemoveGeneration(failedJob));
    const confirm = mocks.openConfirm.mock.calls.at(-1)?.[0] as {
      onConfirm: () => Promise<void>;
    };
    await act(confirm.onConfirm);

    expect(mocks.bulkDelete).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledWith('failed-local');
  });

  it('soft-deletes a persisted failed generation before removing its card', async () => {
    const onDeleted = vi.fn();
    const onRefresh = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({
        onAttachReference: vi.fn(),
        onDeleted,
        onRefresh,
      }),
    );

    act(() =>
      result.current.onRemoveGeneration({
        createdAt: 1,
        id: 'live-job-1',
        ingredientId: 'ingredient-failed-1',
        prompt: 'A failed prompt',
        status: IngredientStatus.FAILED,
        type: 'image',
      }),
    );
    const confirm = mocks.openConfirm.mock.calls.at(-1)?.[0] as {
      onConfirm: () => Promise<void>;
    };
    mocks.bulkDelete.mockResolvedValueOnce({
      deleted: ['ingredient-failed-1'],
      failed: [],
      message: 'Successfully deleted 1 ingredient(s)',
    });
    await act(confirm.onConfirm);

    expect(mocks.bulkDelete).toHaveBeenCalledWith({
      ids: ['ingredient-failed-1'],
      type: 'ingredients-delete',
    });
    expect(onDeleted).toHaveBeenCalledWith('live-job-1');
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('keeps a persisted failed card visible when soft-delete fails', async () => {
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      useStudioGenerateAssetActions({
        onAttachReference: vi.fn(),
        onDeleted,
        onRefresh: vi.fn(),
      }),
    );

    act(() =>
      result.current.onRemoveGeneration({
        createdAt: 1,
        id: 'live-job-1',
        ingredientId: 'ingredient-failed-1',
        prompt: 'A failed prompt',
        status: IngredientStatus.FAILED,
        type: 'image',
      }),
    );
    const confirm = mocks.openConfirm.mock.calls.at(-1)?.[0] as {
      onConfirm: () => Promise<void>;
    };
    mocks.bulkDelete.mockResolvedValueOnce({
      deleted: [],
      failed: ['ingredient-failed-1'],
      message: 'Not deleted',
    });
    await act(confirm.onConfirm);

    expect(onDeleted).not.toHaveBeenCalled();
    expect(mocks.notificationsError).toHaveBeenCalledWith(
      'Failed to remove generation',
    );
  });
});
