import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardEntry } from './use-storyboard-entry';

const mocks = vi.hoisted(() => ({
  findByIds: vi.fn(),
  create: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  error: vi.fn(),
  scope: {
    brandId: 'entry-brand',
    organizationId: 'entry-org',
    userId: 'entry-user',
    sessionId: 'entry-session',
  },
}));
const href = (path: string) => `/entry-org/entry-brand${path}`;
const getService = async () => ({
  createStoryboardRun: mocks.create,
  findByIds: mocks.findByIds,
});
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.scope,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.scope,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href }),
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {},
}));
vi.mock('@services/content/content-runs.service', () => ({
  ContentRunsService: {},
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.error },
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: { getInstance: () => ({ error: mocks.notify }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function asset(id: string, category = IngredientCategory.IMAGE): IIngredient {
  return {
    id,
    category,
    organizationId: 'entry-org',
    brandId: 'entry-brand',
    scope: AssetScope.USER,
    status: IngredientStatus.UPLOADED,
    isDeleted: false,
  } as IIngredient;
}
function deferred() {
  let resolve!: (value: { id: string }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ id: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('typed asset Storyboard entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByIds.mockReset();
    mocks.create.mockReset().mockResolvedValue({ id: 'entry-run' });
    Object.assign(mocks.scope, {
      brandId: 'entry-brand',
      organizationId: 'entry-org',
      userId: 'entry-user',
      sessionId: 'entry-session',
    });
  });

  it.each([IngredientCategory.IMAGE, IngredientCategory.VIDEO])(
    'sends only the source and intent UUID, then opens the scoped run: %s',
    async (category) => {
      const { result } = renderHook(useStoryboardEntry);
      await act(async () =>
        result.current.createFromAsset(asset(`owned-${category}`, category)),
      );
      expect(mocks.create).toHaveBeenCalledWith('entry-brand', {
        clientRequestId: expect.any(String),
        source:
          category === IngredientCategory.VIDEO
            ? { kind: 'uploaded_video', assetId: `owned-${category}` }
            : {
                kind: 'brief',
                brief: '',
                seedImageAssetId: `owned-${category}`,
              },
      });
      expect(Object.keys(mocks.create.mock.calls[0][1]).sort()).toEqual([
        'clientRequestId',
        'source',
      ]);
      expect(mocks.push).toHaveBeenCalledWith(
        '/entry-org/entry-brand/studio/storyboard/entry-run',
      );
    },
  );

  it('resolves a completed upload once and creates from the existing owned video without reuploading', async () => {
    mocks.findByIds.mockResolvedValue([
      asset('completed-upload', IngredientCategory.VIDEO),
    ]);
    const { result } = renderHook(useStoryboardEntry);
    await act(async () => {
      await Promise.all([
        result.current.createFromUploadAssetId('completed-upload'),
        result.current.createFromUploadAssetId('completed-upload'),
      ]);
    });
    expect(mocks.findByIds).toHaveBeenCalledExactlyOnceWith([
      'completed-upload',
    ]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][1].source).toEqual({
      kind: 'uploaded_video',
      assetId: 'completed-upload',
    });
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('shares a pending create across repeated clicks and navigates once', async () => {
    const response = deferred();
    mocks.create.mockReturnValue(response.promise);
    const { result } = renderHook(useStoryboardEntry);
    const selected = asset('double-click');
    act(() => {
      void result.current.createFromAsset(selected);
      void result.current.createFromAsset(selected);
    });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(result.current.pendingAssetId).toBe('double-click');
    await act(async () => response.resolve({ id: 'one-run' }));
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(result.current.isCreating).toBe(false);
  });

  it('retains the selected source and UUID after an ambiguous failure for action retry', async () => {
    mocks.create
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue({ id: 'recovered' });
    const { result } = renderHook(useStoryboardEntry);
    const selected = asset('ambiguous-retry');
    await act(async () => result.current.createFromAsset(selected));
    expect(mocks.notify).toHaveBeenCalledWith(
      'creationFailed',
      expect.objectContaining({
        actionLabel: 'Add to Storyboard',
        onAction: expect.any(Function),
      }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => result.current.createFromAsset(selected));
    expect(mocks.create.mock.calls[1][1]).toEqual(
      mocks.create.mock.calls[0][1],
    );
    expect(selected.id).toBe('ambiguous-retry');
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it.each(['brandId', 'organizationId', 'userId', 'sessionId'] as const)(
    'fences late navigation and errors after %s changes including A-B-A',
    async (field) => {
      const response = deferred();
      mocks.create.mockReturnValue(response.promise);
      const { result, rerender } = renderHook(useStoryboardEntry);
      act(() => {
        void result.current.createFromAsset(asset(`scope-${field}`));
      });
      await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
      const oldValue = mocks.scope[field];
      mocks.scope[field] = 'other';
      rerender();
      mocks.scope[field] = oldValue;
      rerender();
      await act(async () => response.resolve({ id: 'late-run' }));
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.notify).not.toHaveBeenCalled();
    },
  );

  it('shows a specific owned-video validation refusal before any navigation', async () => {
    mocks.create.mockRejectedValue({
      errors: [
        {
          status: '422',
          detail: 'Choose a video up to 60 seconds and 100 MiB.',
        },
      ],
    });
    const { result } = renderHook(useStoryboardEntry);
    await act(async () =>
      result.current.createFromAsset(
        asset('over-limit-video', IngredientCategory.VIDEO),
      ),
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      'creationFailed',
      expect.objectContaining({
        description: 'Choose a video up to 60 seconds and 100 MiB.',
      }),
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('ignores a late response after unmount', async () => {
    const response = deferred();
    mocks.create.mockReturnValue(response.promise);
    const { result, unmount } = renderHook(useStoryboardEntry);
    act(() => {
      void result.current.createFromAsset(asset('unmount'));
    });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => response.reject(new Error('late failure')));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('refuses foreign, deleted, non-user, unfinished and non-media assets without creating', async () => {
    const selected = asset('invalid');
    const { result } = renderHook(useStoryboardEntry);
    for (const patch of [
      { brandId: 'foreign' },
      { organizationId: 'foreign' },
      { isDeleted: true },
      { scope: AssetScope.PUBLIC },
      { status: IngredientStatus.PROCESSING },
      { category: IngredientCategory.MUSIC },
    ]) {
      await act(async () =>
        result.current.createFromAsset({ ...selected, ...patch }),
      );
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
