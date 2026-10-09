import type {
  IIngredient,
  MediaDeliveryGrant,
} from '@genfeedai/contracts/interfaces';
import { useAuthorizedMediaPreview } from '@hooks/media/use-authorized-media-preview';
import { act, renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
  identity: { orgId: 'org-a', sessionId: 'session-a', userId: 'user-a' },
  previewGrant: vi.fn(),
  publicGrant: vi.fn(),
}));
const service = { previewGrant: state.previewGrant };
const getService = vi.fn(async () => service);
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));
vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => state.identity,
}));
vi.mock('@genfeedai/services/content/ingredients.service', () => ({
  IngredientsService: { getInstance: vi.fn(), publicGrant: state.publicGrant },
}));

const pending: MediaDeliveryGrant = {
  id: 'image-a',
  purpose: 'preview',
  state: 'PENDING',
  url: null,
  expiresAt: null,
};
const ready: MediaDeliveryGrant = {
  ...pending,
  state: 'READY',
  url: 'https://signed.test/new',
  expiresAt: null,
};
function ingredient(grant = pending) {
  return { id: 'image-a', mediaDelivery: grant } as IIngredient;
}

describe('authorized media preview refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.previewGrant.mockReset();
    state.publicGrant.mockReset();
    getService.mockClear();
    state.identity.orgId = 'org-a';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('explicitly retries a failed delivery through a read and hides its old URL until authorized', async () => {
    const failed = ingredient({ ...ready, state: 'FAILED' });
    let resolve: (grant: MediaDeliveryGrant) => void = () => {};
    state.previewGrant.mockImplementation(
      () =>
        new Promise<MediaDeliveryGrant>((accept) => {
          resolve = accept;
        }),
    );
    const { result, rerender, unmount } = renderHook(
      ({ revision }) => useAuthorizedMediaPreview(failed, revision),
      { initialProps: { revision: 0 } },
    );
    expect(state.previewGrant).not.toHaveBeenCalled();
    rerender({ revision: 1 });
    expect(result.current?.url).toBeNull();
    expect(result.current?.state).toBe('PENDING');
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(ready);
    });
    expect(result.current).toEqual(ready);
    unmount();
  });

  it('rejects an explicit retry response for a different asset and offers another attempt after failure', async () => {
    const failed = ingredient({ ...ready, state: 'FAILED' });
    state.previewGrant
      .mockResolvedValueOnce({ ...ready, id: 'foreign-asset' })
      .mockResolvedValueOnce(ready);
    const { result, rerender, unmount } = renderHook(
      ({ revision }) => useAuthorizedMediaPreview(failed, revision),
      { initialProps: { revision: 1 } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current?.state).toBe('FAILED');
    expect(result.current?.url).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(1);
    rerender({ revision: 2 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual(ready);
    unmount();
  });

  it('hides deleted assets and aborts their pending explicit retry', async () => {
    state.previewGrant.mockImplementation(
      () => new Promise<MediaDeliveryGrant>(() => {}),
    );
    const asset = ingredient(ready);
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useAuthorizedMediaPreview(value, 1),
      { initialProps: { value: asset } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    const signal = state.previewGrant.mock.calls[0][1] as AbortSignal;
    rerender({ value: { ...asset, isDeleted: true } });
    expect(signal.aborted).toBe(true);
    expect(result.current).toBeNull();
    expect(state.previewGrant).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('refreshes anonymous share grants through canonical public access without requiring a login', async () => {
    state.publicGrant.mockResolvedValue({ ...ready, purpose: 'public-share' });
    const { unmount } = renderHook(() =>
      useAuthorizedMediaPreview(
        ingredient({
          ...ready,
          purpose: 'public-share',
          expiresAt: new Date(Date.now() + 5000).toISOString(),
        }),
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(state.publicGrant).toHaveBeenCalledWith(
      'image-a',
      'public-share',
      expect.any(AbortSignal),
    );
    expect(getService).not.toHaveBeenCalled();
    unmount();
  });

  it('retries a transient failed batch and adopts the later authorized grant', async () => {
    state.previewGrant.mockResolvedValueOnce(null).mockResolvedValueOnce(ready);
    const { result, unmount } = renderHook(() =>
      useAuthorizedMediaPreview(ingredient()),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current?.state).toBe('PENDING');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(2);
    expect(result.current?.url).toBe(ready.url);
    unmount();
  });

  it('immediately hides and reauthorizes a retained READY grant on workspace changes and switches back', async () => {
    const retained = ingredient({
      ...ready,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
    let accept: (grant: MediaDeliveryGrant) => void = () => {};
    state.previewGrant.mockImplementation(
      () =>
        new Promise<MediaDeliveryGrant>((resolve) => {
          accept = resolve;
        }),
    );
    const { result, rerender, unmount } = renderHook(() =>
      useAuthorizedMediaPreview(retained),
    );
    expect(result.current?.url).toBe(ready.url);
    state.identity.orgId = 'org-b';
    rerender();
    expect(result.current?.url).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(1);
    await act(async () => {
      accept({ ...ready, url: 'https://signed.test/reauthorized-b' });
      await Promise.resolve();
    });
    expect(result.current?.url).toBe('https://signed.test/reauthorized-b');
    state.identity.orgId = 'org-a';
    rerender();
    expect(result.current?.url).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('retries a retained READY grant after a context-switch network exception before the old expiry', async () => {
    const retained = ingredient({
      ...ready,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
    state.previewGrant
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        ...ready,
        url: 'https://signed.test/new-context',
      });
    const { result, rerender, unmount } = renderHook(() =>
      useAuthorizedMediaPreview(retained),
    );
    state.identity.orgId = 'org-b';
    rerender();
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current?.url).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(state.previewGrant).toHaveBeenCalledTimes(2);
    expect(result.current?.url).toBe('https://signed.test/new-context');
    unmount();
  });

  it('aborts a previous workspace request and ignores its late grant', async () => {
    let resolveOld: (grant: MediaDeliveryGrant) => void = () => {};
    state.previewGrant
      .mockImplementationOnce(
        () =>
          new Promise<MediaDeliveryGrant>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...ready,
        url: 'https://signed.test/workspace-b',
      });
    const { result, rerender, unmount } = renderHook(() =>
      useAuthorizedMediaPreview(ingredient()),
    );
    await act(async () => {
      await Promise.resolve();
    });
    const oldSignal = state.previewGrant.mock.calls[0][1] as AbortSignal;
    state.identity.orgId = 'org-b';
    rerender();
    await act(async () => {
      await Promise.resolve();
    });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      resolveOld(ready);
      await Promise.resolve();
    });
    expect(result.current?.url).toBe('https://signed.test/workspace-b');
    unmount();
  });

  it('resets same-id grants when a fresh response carries a different source URL', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ value }) => useAuthorizedMediaPreview(value),
      { initialProps: { value: ingredient(ready) } },
    );
    expect(result.current?.url).toBe(ready.url);
    const revised = { ...ready, url: 'https://signed.test/revised' };
    rerender({ value: ingredient(revised) });
    expect(result.current?.url).toBe(revised.url);
    unmount();
  });
});
