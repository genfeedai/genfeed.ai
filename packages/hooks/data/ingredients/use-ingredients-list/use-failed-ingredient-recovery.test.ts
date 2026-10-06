import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { UseFailedIngredientRecoveryProps } from '@genfeedai/props/content/ingredient-recovery.props';
import { useFailedIngredientRecovery } from '@hooks/data/ingredients/use-ingredients-list/use-failed-ingredient-recovery';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  bulkDelete: vi.fn(),
  imagePost: vi.fn(),
  videoPost: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock(
  '@genfeedai/contexts/providers/global-modals/global-modals.provider',
  () => ({ useConfirmModal: () => ({ openConfirm: mocks.confirm }) }),
);
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => path }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => async () =>
    factory('token'),
}));
vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: { getInstance: () => ({ post: mocks.imagePost }) },
}));
vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: { getInstance: () => ({ post: mocks.videoPost }) },
}));
vi.mock('@genfeedai/services/content/agent-studio-handoff.service', () => ({
  AgentStudioHandoffService: { getInstance: () => ({ create: mocks.create }) },
}));
vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      success: mocks.success,
      error: mocks.error,
      warning: mocks.warning,
    }),
  },
}));
vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function asset(id: string, extra: Partial<IIngredient> = {}): IIngredient {
  return {
    id,
    category: IngredientCategory.IMAGE,
    status: IngredientStatus.FAILED,
    generationPrompt: 'Saved prompt',
    generationError: '503 Service unavailable',
    modelUsed: 'original-model',
    ...extra,
  } as IIngredient;
}
let props: UseFailedIngredientRecoveryProps;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.imagePost.mockResolvedValue({ id: 'new-generation' });
  mocks.create.mockResolvedValue({ id: 'handoff-1' });
  mocks.bulkDelete.mockImplementation(async ({ ids }: { ids: string[] }) => ({
    deleted: ids,
    failed: [],
  }));
  props = {
    ingredients: [asset('a'), asset('b')],
    scopeKey: 'org:brand:failed',
    brandId: 'brand',
    getService: vi.fn(async () => ({
      bulkDelete: mocks.bulkDelete,
    })) as UseFailedIngredientRecoveryProps['getService'],
    setIngredients: vi.fn(),
    setSelectedIds: vi.fn(),
    onRefresh: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Failed Library recovery operations', () => {
  it('captures confirmed IDs, excludes non-failures and retains partial failures', async () => {
    const { result } = renderHook(() => useFailedIngredientRecovery(props));
    result.current.handleDeleteFailedIngredients(['a', 'a', 'b', 'foreign']);
    expect(mocks.bulkDelete).not.toHaveBeenCalled();
    mocks.bulkDelete.mockResolvedValueOnce({ deleted: ['a'], failed: ['b'] });
    await act(async () => mocks.confirm.mock.calls[0][0].onConfirm());
    expect(mocks.bulkDelete).toHaveBeenCalledWith({
      ids: ['a', 'b'],
      type: 'ingredients-delete',
    });
    const updateRows = vi.mocked(props.setIngredients).mock.calls[0][0];
    expect(
      typeof updateRows === 'function'
        ? updateRows(props.ingredients).map((item) => item.id)
        : [],
    ).toEqual(['b']);
    const updateSelection = vi.mocked(props.setSelectedIds).mock.calls[0][0];
    expect(
      typeof updateSelection === 'function' ? updateSelection(['a', 'b']) : [],
    ).toEqual(['b']);
    expect(mocks.error).toHaveBeenCalledWith('deleteFailed');
  });
  it('batches Delete all at the API limit and continues after a failed batch', async () => {
    props.ingredients = Array.from({ length: 205 }, (_, i) =>
      asset(`asset-${i}`),
    );
    const { result } = renderHook(() => useFailedIngredientRecovery(props));
    result.current.handleDeleteFailedIngredients(
      props.ingredients.map((item) => item.id),
    );
    mocks.bulkDelete.mockRejectedValueOnce(new Error('outage'));
    await act(async () => mocks.confirm.mock.calls[0][0].onConfirm());
    expect(
      mocks.bulkDelete.mock.calls.map(([request]) => request.ids.length),
    ).toEqual([100, 100, 5]);
    const updateRows = vi.mocked(props.setIngredients).mock.calls[0][0];
    expect(
      typeof updateRows === 'function'
        ? updateRows(props.ingredients).length
        : 0,
    ).toBe(100);
  });
  it('rejects a stale confirmation after the brand/filter scope changes', async () => {
    const { result, rerender } = renderHook(
      (input) => useFailedIngredientRecovery(input),
      { initialProps: props },
    );
    result.current.handleDeleteFailedIngredients(['a']);
    rerender({ ...props, scopeKey: 'other-brand' });
    await act(async () => mocks.confirm.mock.calls[0][0].onConfirm());
    expect(mocks.bulkDelete).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith('scopeChanged');
  });
  it('preserves saved scope, prompt, model and references on retry and skips input failures', async () => {
    props.ingredients = [
      asset('a', {
        sources: ['ref-a'],
        references: ['ref-a', 'ref-b'],
        width: 1024,
        height: 1024,
        brandId: 'brand',
        folderId: 'folder',
      }),
      asset('b', { generationError: '422 invalid input' }),
    ];
    const { result } = renderHook(() => useFailedIngredientRecovery(props));
    result.current.handleRetryFailedIngredients(props.ingredients);
    await act(async () => mocks.confirm.mock.calls[0][0].onConfirm());
    expect(mocks.imagePost).toHaveBeenCalledTimes(1);
    expect(mocks.imagePost).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Saved prompt',
        model: 'original-model',
        references: ['ref-a', 'ref-b'],
        brandId: 'brand',
        folderId: 'folder',
        width: 1024,
        height: 1024,
      }),
    );
    expect(result.current.retriedIds).toEqual(['a']);
    result.current.handleRetryFailedIngredients([props.ingredients[0]]);
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });
  it('opens editable inputs in Studio through a scoped handoff without generating', async () => {
    const { result } = renderHook(() => useFailedIngredientRecovery(props));
    await act(async () =>
      result.current.handleReviewFailedIngredient(
        asset('a', { sources: ['ref'], width: 1024, height: 1024 }),
      ),
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 'brand',
        prompt: 'Saved prompt',
        modelKey: 'original-model',
        references: ['ref'],
        type: 'image',
        aspectRatio: '1:1',
      }),
    );
    expect(mocks.push).toHaveBeenCalledWith(
      expect.stringContaining('handoff=handoff-1'),
    );
    expect(mocks.imagePost).not.toHaveBeenCalled();
  });
});
