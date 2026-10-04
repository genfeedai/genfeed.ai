import { TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_ASSET_TAGS_EVENT } from '@genfeedai/contracts/constants';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryTagWrites } from './use-library-tag-writes';

const { invalidateQueries, ingredientsService, notifications } = vi.hoisted(
  () => ({
    ingredientsService: { bulkTag: vi.fn() },
    invalidateQueries: vi.fn(),
    notifications: { error: vi.fn(), success: vi.fn() },
  }),
);

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ingredientsService,
}));

vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: () => ingredientsService },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => notifications },
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

const tag = { id: 'tag-1', label: 'S1E12' } as ITag;

function result(overrides: Record<string, unknown> = {}) {
  return {
    changed: 0,
    failed: 0,
    failedIds: [],
    skipped: 0,
    skippedIds: [],
    ...overrides,
  };
}

describe('useLibraryTagWrites', () => {
  const listener = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.removeEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);
    window.addEventListener(LIBRARY_ASSET_TAGS_EVENT, listener);
  });

  it('sends one bulk request for the assets and publishes only what changed', async () => {
    ingredientsService.bulkTag.mockResolvedValue(
      result({ changed: 2, skipped: 1, skippedIds: ['b'] }),
    );
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    let outcome: Awaited<ReturnType<typeof hook.current.applyTag>> = null;
    await act(async () => {
      outcome = await hook.current.applyTag(TagBulkAction.ADD, tag, [
        'a',
        'b',
        'c',
      ]);
    });

    expect(ingredientsService.bulkTag).toHaveBeenCalledWith({
      action: TagBulkAction.ADD,
      ids: ['a', 'b', 'c'],
      tagId: 'tag-1',
    });
    expect(outcome).toMatchObject({ changedIds: ['a', 'c'] });
    const change = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(change).toEqual({
      action: TagBulkAction.ADD,
      ingredientIds: ['a', 'c'],
      tag,
    });
  });

  it('reports how many changed and how many were skipped', async () => {
    ingredientsService.bulkTag.mockResolvedValue(
      result({ changed: 18, skipped: 2, skippedIds: ['x', 'y'] }),
    );
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    await act(async () => {
      await hook.current.applyTag(
        TagBulkAction.ADD,
        tag,
        Array.from({ length: 20 }, (_, index) => `asset-${index}`),
      );
    });

    expect(notifications.success).toHaveBeenCalledWith(
      'Added “S1E12” to 18 assets, skipped 2',
    );
  });

  it('reports a removal', async () => {
    ingredientsService.bulkTag.mockResolvedValue(result({ changed: 1 }));
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    await act(async () => {
      await hook.current.applyTag(TagBulkAction.REMOVE, tag, ['a', 'b']);
    });

    expect(notifications.success).toHaveBeenCalledWith(
      'Removed “S1E12” from 1 asset',
    );
  });

  it('reports partial failure with all three counts and publishes only the assets that changed', async () => {
    ingredientsService.bulkTag.mockResolvedValue(
      result({
        changed: 1,
        failed: 1,
        failedIds: ['b'],
        skipped: 1,
        skippedIds: ['c'],
      }),
    );
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    await act(async () => {
      await hook.current.applyTag(TagBulkAction.ADD, tag, ['a', 'b', 'c']);
    });

    expect(notifications.error).toHaveBeenCalledWith(
      'Changed 1, skipped 1, failed 1. Try again for the rest.',
    );
    expect(
      (listener.mock.calls[0][0] as CustomEvent).detail.ingredientIds,
    ).toEqual(['a']);
  });

  it('is calm when one asset already has the tag', async () => {
    ingredientsService.bulkTag.mockResolvedValue(
      result({ skipped: 1, skippedIds: ['a'] }),
    );
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    await act(async () => {
      await hook.current.applyTag(TagBulkAction.ADD, tag, ['a']);
    });

    expect(notifications.success).toHaveBeenCalledWith(
      'This asset already has “S1E12”',
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it('refreshes tag counts after a write', async () => {
    ingredientsService.bulkTag.mockResolvedValue(result({ changed: 1 }));
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    await act(async () => {
      await hook.current.applyTag(TagBulkAction.ADD, tag, ['a']);
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['library-tags'],
    });
  });

  it('answers null and says so when the request fails, publishing nothing', async () => {
    ingredientsService.bulkTag.mockRejectedValue(new Error('network'));
    const { result: hook } = renderHook(() => useLibraryTagWrites());

    let outcome: unknown = 'unset';
    await act(async () => {
      outcome = await hook.current.applyTag(TagBulkAction.ADD, tag, ['a']);
    });

    expect(outcome).toBeNull();
    expect(notifications.error).toHaveBeenCalledWith(
      'The tags could not be updated.',
    );
    expect(listener).not.toHaveBeenCalled();
    expect(hook.current.isWriting).toBe(false);
  });
});
