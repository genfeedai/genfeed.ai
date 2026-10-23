import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudioAudioLibrary } from './useStudioAudioLibrary';

const mocks = vi.hoisted(() => ({
  findAllPage: vi.fn(),
  getService: vi.fn(),
  error: vi.fn(),
  brandId: 'brand-a',
  organizationId: 'org-a',
  identity: { userId: 'user-a', sessionId: 'session-a', orgId: 'org-a' },
}));
vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: mocks.brandId,
    organizationId: mocks.organizationId,
  }),
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => mocks.identity,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => {
    const { userId, sessionId, orgId } = mocks.identity;
    // biome-ignore lint/correctness/useExhaustiveDependencies: Mirror the auth getter's identity contract.
    return useCallback(() => mocks.getService(), [userId, sessionId, orgId]);
  },
}));
vi.mock('@services/content/ingredients.service', () => ({
  IngredientsService: {},
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { apiEndpoint: 'https://api.example.test' },
}));
vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.error },
}));
function page(id?: string) {
  return {
    items: id
      ? [
          new Ingredient({
            id,
            category: IngredientCategory.AUDIO,
            status: IngredientStatus.UPLOADED,
            brandId: mocks.brandId,
            organizationId: mocks.organizationId,
            s3Key: `audio/${id}`,
          }),
        ]
      : [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAllPage.mockReset().mockResolvedValue(page());
  mocks.getService
    .mockReset()
    .mockResolvedValue({ findAllPage: mocks.findAllPage });
  mocks.brandId = 'brand-a';
  mocks.organizationId = 'org-a';
  mocks.identity = { userId: 'user-a', sessionId: 'session-a', orgId: 'org-a' };
});
describe('scoped Studio audio Library', () => {
  it('reads only while the audio picker is enabled and cancels on close', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useStudioAudioLibrary(enabled),
      { initialProps: { enabled: false } },
    );
    expect(mocks.getService).not.toHaveBeenCalled();
    mocks.findAllPage.mockResolvedValue(page('recording'));
    rerender({ enabled: true });
    await waitFor(() =>
      expect(result.current.items.map((item) => item.id)).toEqual([
        'recording',
      ]),
    );
    const signal = mocks.findAllPage.mock.calls[0][1];
    rerender({ enabled: false });
    expect(result.current.items).toEqual([]);
    expect(signal.aborted).toBe(true);
  });
  it.each(['brand', 'actor', 'session', 'organization'])(
    'rejects old results after a %s A-to-B-to-A scope change',
    async (scope) => {
      const old = deferred<ReturnType<typeof page>>();
      mocks.findAllPage.mockImplementationOnce(() => old.promise);
      const { result, rerender } = renderHook(() =>
        useStudioAudioLibrary(true),
      );
      await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(3));
      if (scope === 'brand') mocks.brandId = 'brand-b';
      if (scope === 'actor') mocks.identity.userId = 'user-b';
      if (scope === 'session') mocks.identity.sessionId = 'session-b';
      if (scope === 'organization') mocks.organizationId = 'org-b';
      rerender();
      expect(result.current.items).toEqual([]);
      await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(6));
      mocks.brandId = 'brand-a';
      mocks.organizationId = 'org-a';
      mocks.identity = {
        userId: 'user-a',
        sessionId: 'session-a',
        orgId: 'org-a',
      };
      rerender();
      await waitFor(() => expect(mocks.findAllPage).toHaveBeenCalledTimes(9));
      await act(async () => old.resolve(page('stale')));
      expect(result.current.items).toEqual([]);
    },
  );
  it('shows a failed load without retaining stale items', async () => {
    mocks.findAllPage.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStudioAudioLibrary(true));
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
