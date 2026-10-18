import { WorkflowLifecycle } from '@genfeedai/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowLibraryHighlights } from './useWorkflowLibraryHighlights';

const mocks = vi.hoisted(() => ({
  scope: {
    brandId: 'brand-1',
    organizationId: 'org-1',
    pageScope: 'brand',
    isReady: true,
  },
  createWorkflows: vi.fn(),
  getWorkflows: vi.fn(),
  getUsers: vi.fn(),
  settings: vi.fn(),
  save: vi.fn(),
  listByIds: vi.fn(),
  mostUsed: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  useCollectionScope: () => mocks.scope,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: unknown) =>
    factory === mocks.createWorkflows ? mocks.getWorkflows : mocks.getUsers,
}));
vi.mock('@/features/workflows/services/workflow-api', () => ({
  createWorkflowApiService: mocks.createWorkflows,
}));
vi.mock('@services/organization/users.service', () => ({
  UsersService: { getInstance: vi.fn() },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.error }) },
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const workflow = {
  id: 'favorite-1',
  brandId: 'brand-1',
  label: 'Favorite',
  nodes: [],
  edges: [],
  lifecycle: WorkflowLifecycle.DRAFT,
  createdAt: '2026-09-01',
  updatedAt: '2026-09-02',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    pageScope: 'brand',
    isReady: true,
  };
  mocks.getUsers.mockResolvedValue({
    findMeSettings: mocks.settings,
    patchMeFavoriteWorkflowIds: mocks.save,
  });
  mocks.getWorkflows.mockResolvedValue({
    listByIds: mocks.listByIds,
    listMostUsed: mocks.mostUsed,
  });
  mocks.settings.mockResolvedValue({ favoriteWorkflowIds: ['favorite-1'] });
  mocks.listByIds.mockResolvedValue([workflow]);
  mocks.mostUsed.mockResolvedValue([{ ...workflow, executionCount: 25 }]);
  mocks.save.mockResolvedValue({ favoriteWorkflowIds: [] });
});

describe('workflow library highlights', () => {
  it('loads persisted favorites independently of the current list page and asks for org top five', async () => {
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(mocks.listByIds).toHaveBeenCalledExactlyOnceWith(
      ['favorite-1'],
      expect.any(AbortSignal),
    );
    expect(result.current.favorites.items[0]).toMatchObject({
      id: 'favorite-1',
      nodeCount: 0,
    });
    expect(mocks.mostUsed).toHaveBeenCalledWith(5);
    expect(result.current.mostUsed.items[0].executionCount).toBe(25);
  });

  it('preserves readable favorites and can remove an inaccessible id through settings', async () => {
    mocks.settings.mockResolvedValue({
      favoriteWorkflowIds: ['favorite-1', 'inaccessible'],
    });
    mocks.listByIds.mockResolvedValue([workflow]);
    mocks.save.mockResolvedValue({ favoriteWorkflowIds: ['favorite-1'] });
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));

    expect(result.current.favorites.hasError).toBe(false);
    expect(result.current.favorites.items.map((item) => item.id)).toEqual([
      'favorite-1',
    ]);
    expect(result.current.favoriteIds).toEqual(['favorite-1', 'inaccessible']);

    await act(async () =>
      result.current.toggleFavorite({
        ...result.current.favorites.items[0],
        id: 'inaccessible',
      }),
    );
    expect(mocks.save).toHaveBeenCalledWith(['favorite-1']);
    expect(result.current.favoriteIds).toEqual(['favorite-1']);
    expect(result.current.favorites.items.map((item) => item.id)).toEqual([
      'favorite-1',
    ]);
  });

  it('reports a batch failure and retries without losing saved ids', async () => {
    mocks.listByIds.mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(result.current.favorites.hasError).toBe(true);
    expect(result.current.favorites.items).toEqual([]);
    expect(result.current.favoriteIds).toEqual(['favorite-1']);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.favorites.items).toHaveLength(1));
    expect(result.current.favorites.hasError).toBe(false);
  });

  it('reports a settings read failure and prevents overwriting unknown favorites', async () => {
    mocks.settings.mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(result.current.favorites.hasError).toBe(true);
    expect(result.current.favorites.items).toEqual([]);
    expect(result.current.mostUsed.items).toHaveLength(1);
    await act(async () =>
      result.current.toggleFavorite({ ...workflow, nodeCount: 0 }),
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('keeps favorites available when team usage fails', async () => {
    mocks.mostUsed.mockRejectedValue(new Error('Unavailable'));
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(result.current.mostUsed.hasError).toBe(true);
    expect(result.current.favorites.items).toHaveLength(1);
    expect(result.current.favorites.hasError).toBe(false);
  });

  it('persists a removed favorite and keeps the prior selection on a rejected write', async () => {
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    const favorite = result.current.favorites.items[0];
    mocks.save.mockRejectedValueOnce(new Error('Failed'));
    await act(async () => result.current.toggleFavorite(favorite));
    expect(result.current.favoriteIds).toEqual(['favorite-1']);
    expect(mocks.error).toHaveBeenCalled();
    await act(async () => result.current.toggleFavorite(favorite));
    expect(mocks.save).toHaveBeenCalledWith([]);
    expect(result.current.favoriteIds).toEqual([]);
    expect(result.current.favorites.items).toEqual([]);
  });

  it('ignores a late response after an organization change', async () => {
    let finishOld:
      | ((value: { favoriteWorkflowIds: string[] }) => void)
      | undefined;
    mocks.settings.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        }),
    );
    const { result, rerender } = renderHook(() =>
      useWorkflowLibraryHighlights(),
    );
    await waitFor(() => expect(mocks.settings).toHaveBeenCalledOnce());
    mocks.scope = { ...mocks.scope, organizationId: 'org-2' };
    mocks.settings.mockResolvedValue({ favoriteWorkflowIds: [] });
    rerender();
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    await act(async () =>
      finishOld?.({ favoriteWorkflowIds: ['old-org-workflow'] }),
    );
    expect(result.current.favoriteIds).toEqual([]);
    expect(mocks.listByIds).not.toHaveBeenCalled();
  });

  it('loads 50 favorites in one request and restores saved order while omitting absent rows', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `favorite-${index}`);
    mocks.settings.mockResolvedValue({ favoriteWorkflowIds: ids });
    mocks.listByIds.mockResolvedValue([
      { ...workflow, id: ids[49] },
      { ...workflow, id: ids[0] },
    ]);
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(mocks.listByIds).toHaveBeenCalledExactlyOnceWith(
      ids,
      expect.any(AbortSignal),
    );
    expect(result.current.favorites.items.map((item) => item.id)).toEqual([
      ids[0],
      ids[49],
    ]);
    expect(result.current.favoriteIds).toEqual(ids);
  });

  it.each(['organizationId', 'brandId'] as const)(
    'aborts the batch and ignores late rows after a %s change',
    async (key) => {
      let finishOld: ((value: (typeof workflow)[]) => void) | undefined;
      mocks.listByIds.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      );
      const { result, rerender } = renderHook(() =>
        useWorkflowLibraryHighlights(),
      );
      await waitFor(() => expect(mocks.listByIds).toHaveBeenCalledOnce());
      const signal = mocks.listByIds.mock.calls[0][1] as AbortSignal;
      mocks.scope = { ...mocks.scope, [key]: 'new-scope' };
      mocks.settings.mockResolvedValue({ favoriteWorkflowIds: [] });
      rerender();
      await waitFor(() =>
        expect(result.current.favorites.isLoading).toBe(false),
      );
      expect(signal.aborted).toBe(true);
      await act(async () => finishOld?.([workflow]));
      expect(result.current.favorites.items).toEqual([]);
      expect(result.current.favoriteIds).toEqual([]);
    },
  );

  it('filters favorites to the current brand without changing org usage', async () => {
    mocks.listByIds.mockResolvedValue([
      { ...workflow, brandId: 'another-brand' },
    ]);
    const { result } = renderHook(() => useWorkflowLibraryHighlights());
    await waitFor(() => expect(result.current.favorites.isLoading).toBe(false));
    expect(result.current.favorites.items).toEqual([]);
    expect(result.current.favoriteIds).toEqual(['favorite-1']);
    expect(result.current.mostUsed.items).toHaveLength(1);
  });
});
