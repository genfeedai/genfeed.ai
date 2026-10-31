import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioPlaygroundModels } from './useStudioPlaygroundModels';

const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  getToken: vi.fn(async () => 'stub-token'),
  userId: 'user-a',
  sessionId: 'session-a',
  orgId: 'org-1',
  apiEndpoint: 'https://api.example.test',
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks,
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    get apiEndpoint() {
      return mocks.apiEndpoint;
    },
  },
}));
vi.mock('@services/ai/models.service', () => ({
  ModelsService: { getInstance: () => ({ findAll: mocks.findAll }) },
}));

function makeModel(key: string, category: ModelCategory): IModel {
  return { category, isActive: true, key, label: key } as IModel;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useStudioPlaygroundModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findAll.mockReset();
    mocks.getToken.mockReset().mockResolvedValue('stub-token');
    mocks.userId = 'user-a';
    mocks.sessionId = 'session-a';
    mocks.orgId = 'org-1';
    mocks.apiEndpoint = 'https://api.example.test';
  });

  it('keeps only speech rows from the VOICE category, dropping avatar rows', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel(MODEL_KEYS.ELEVENLABS_V4, ModelCategory.VOICE),
      makeModel(MODEL_KEYS.HEYGEN_VOICE, ModelCategory.VOICE),
      makeModel('heygen/avatar', ModelCategory.VOICE),
      makeModel('argil/atom', ModelCategory.VOICE),
    ]);

    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.VOICE, 'org-1'),
    );

    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    expect(result.current.models.map((model) => model.key)).toEqual([
      MODEL_KEYS.ELEVENLABS_V4,
      MODEL_KEYS.HEYGEN_VOICE,
    ]);
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        category: ModelCategory.VOICE,
        isActive: true,
        organizationId: 'org-1',
      }),
      expect.any(AbortSignal),
    );
  });

  it('asks the API for non-retired rows and drops any retired row that still arrives', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel('music-a', ModelCategory.MUSIC),
      {
        ...makeModel('genfeed-ai/gone', ModelCategory.MUSIC),
        lifecycle: ModelLifecycle.RETIRED,
      },
    ]);

    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.MUSIC, 'org-1'),
    );

    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    expect(result.current.models.map((model) => model.key)).toEqual([
      'music-a',
    ]);
    expect(mocks.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ includeRetired: false }),
      expect.any(AbortSignal),
    );
  });

  it('leaves other categories unfiltered', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel('music-a', ModelCategory.MUSIC),
      makeModel('music-b', ModelCategory.MUSIC),
    ]);

    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.MUSIC, 'org-1'),
    );

    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    expect(result.current.models).toHaveLength(2);
  });

  it('returns an empty catalog without fetching when there is no category', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundModels(null, 'org-1'),
    );

    expect(result.current.models).toEqual([]);
    expect(result.current.isModelCatalogReady).toBe(false);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });
  it.each([
    'actor',
    'session',
    'auth organization',
    'organization',
    'category',
    'api',
  ] as const)(
    'hides old models from the first child render after %s changes',
    async (identity) => {
      mocks.findAll.mockResolvedValueOnce([
        makeModel('old-owner', ModelCategory.MUSIC),
      ]);
      const observed: ReturnType<typeof useStudioPlaygroundModels>[] = [];
      const { result, rerender } = renderHook(
        ({ category, organizationId }) => {
          const current = useStudioPlaygroundModels(category, organizationId);
          observed.push(current);
          return current;
        },
        {
          initialProps: {
            category: ModelCategory.MUSIC as ModelCategory,
            organizationId: 'org-1',
          },
        },
      );
      await waitFor(() =>
        expect(result.current.isModelCatalogReady).toBe(true),
      );
      mocks.findAll.mockReturnValue(new Promise(() => {}));
      if (identity === 'actor') mocks.userId = 'user-b';
      else if (identity === 'session') mocks.sessionId = 'session-b';
      else if (identity === 'auth organization') mocks.orgId = 'org-2';
      else if (identity === 'api')
        mocks.apiEndpoint = 'https://other-api.example.test';
      const index = observed.length;
      rerender({
        category:
          identity === 'category' ? ModelCategory.IMAGE : ModelCategory.MUSIC,
        organizationId: identity === 'organization' ? 'org-2' : 'org-1',
      });
      expect(observed[index]).toEqual({
        models: [],
        isLoadingModels: true,
        isModelCatalogReady: false,
      });
      await waitFor(() => expect(mocks.findAll).toHaveBeenCalledTimes(2));
    },
  );

  it.each(['replace', 'unmount'] as const)(
    'does not dispatch after %s during token acquisition',
    async (operation) => {
      const token = deferred<string>();
      mocks.getToken.mockReturnValueOnce(token.promise);
      mocks.findAll.mockResolvedValue([]);
      const { rerender, unmount } = renderHook(
        ({ organizationId }) =>
          useStudioPlaygroundModels(ModelCategory.MUSIC, organizationId),
        { initialProps: { organizationId: 'org-1' } },
      );
      await waitFor(() => expect(mocks.getToken).toHaveBeenCalledTimes(1));
      if (operation === 'unmount') unmount();
      else {
        rerender({ organizationId: 'org-2' });
        await waitFor(() => expect(mocks.findAll).toHaveBeenCalledTimes(1));
      }
      const calls = mocks.findAll.mock.calls.length;
      await act(async () => {
        token.resolve('old-token');
        await token.promise;
      });
      expect(mocks.findAll).toHaveBeenCalledTimes(calls);
    },
  );

  it.each(['success', 'failure'] as const)(
    'ignores late previous-owner models %s after a scope round trip',
    async (outcome) => {
      const old = deferred<IModel[]>();
      mocks.findAll
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue([makeModel('current-owner', ModelCategory.MUSIC)]);
      const { result, rerender } = renderHook(
        ({ organizationId }) =>
          useStudioPlaygroundModels(ModelCategory.MUSIC, organizationId),
        { initialProps: { organizationId: 'org-1' } },
      );
      await waitFor(() => expect(mocks.findAll).toHaveBeenCalledTimes(1));
      rerender({ organizationId: 'org-2' });
      await waitFor(() =>
        expect(result.current.isModelCatalogReady).toBe(true),
      );
      rerender({ organizationId: 'org-1' });
      await waitFor(() =>
        expect(result.current.isModelCatalogReady).toBe(true),
      );
      await act(async () => {
        if (outcome === 'success')
          old.resolve([makeModel('old-owner', ModelCategory.MUSIC)]);
        else old.reject(new Error('Old owner failure'));
      });
      expect(result.current.models.map((model) => model.key)).toEqual([
        'current-owner',
      ]);
      expect(result.current.isModelCatalogReady).toBe(true);
      expect(result.current.isLoadingModels).toBe(false);
    },
  );

  it('keeps the current-owner equal-query catalog cache', async () => {
    mocks.findAll.mockResolvedValue([
      makeModel('current-owner', ModelCategory.MUSIC),
    ]);
    const { result, rerender } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.MUSIC, 'org-1'),
    );
    await waitFor(() => expect(result.current.isModelCatalogReady).toBe(true));
    rerender();
    expect(result.current.models.map((model) => model.key)).toEqual([
      'current-owner',
    ]);
    expect(result.current.isModelCatalogReady).toBe(true);
    expect(mocks.findAll).toHaveBeenCalledTimes(1);
  });

  it('does not fetch without an organization', () => {
    const { result } = renderHook(() =>
      useStudioPlaygroundModels(ModelCategory.MUSIC, undefined),
    );
    expect(result.current.models).toEqual([]);
    expect(result.current.isModelCatalogReady).toBe(false);
    expect(result.current.isLoadingModels).toBe(false);
    expect(mocks.findAll).not.toHaveBeenCalled();
  });
});
