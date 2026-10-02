import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardCharacterReplacements } from './use-storyboard-character-replacements';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  status: vi.fn(),
  post: vi.fn(),
  auth: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.auth,
}));
const props = { brandId: 'brand', runId: 'run', shotId: 'shot' };
const receipt = {
  operationId: 'f22c0c2f-59fa-41d8-b393-a808f65e0b52',
  runId: 'run',
  shotId: 'shot',
  videoAssetId: 'video',
  imageAssetIds: ['image'],
  modelKey: 'higgsfield/genjutsu/motion-transfer/v1.0' as const,
  acceptedRequestIds: [],
  association: 'detached' as const,
  status: 'reconciling' as const,
  chargedCredits: 0 as const,
  limitations: ['No audio'],
};
const saved = { ...receipt, requestId: 'saved', prompt: 'Walk' };
const empty = { operations: [], legacyReplacements: [] };
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    listStoryboardCharacterReplacements: mocks.list,
    getStoryboardCharacterReplacementStatus: mocks.status,
    replaceStoryboardCharacter: mocks.post,
  });
  mocks.list.mockResolvedValue(empty);
});
describe('scoped character receipt lifecycle', () => {
  it('discovers unknown IDs and refreshes only explicit reads without POST', async () => {
    mocks.list.mockResolvedValue({ ...empty, operations: [receipt] });
    const { result } = renderHook(() =>
      useStoryboardCharacterReplacements(props),
    );
    await waitFor(() =>
      expect(result.current.collection.operations).toEqual([receipt]),
    );
    expect(mocks.list.mock.calls[0][3]).toBeInstanceOf(AbortSignal);
    mocks.status.mockResolvedValue({ ...receipt, status: 'blocked' });
    await act(async () => {
      await result.current.refreshStatus(receipt.operationId);
    });
    expect(result.current.collection.operations[0].status).toBe('blocked');
    expect(mocks.status).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.refreshRequests();
    });
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['resolve', 'reject'] as const)(
    'settles POST %s once, retains real fallback, then discovers without retry',
    async (outcome) => {
      const { result } = renderHook(() =>
        useStoryboardCharacterReplacements(props),
      );
      await waitFor(() => expect(result.current.isReading).toBe(false));
      if (outcome === 'resolve') mocks.post.mockResolvedValue(saved);
      else mocks.post.mockRejectedValue(new Error('secret'));
      mocks.list.mockRejectedValueOnce(new Error('read failure'));
      await act(async () => {
        await result.current.submit({ imageAssetIds: ['image'] });
      });
      await waitFor(() => expect(result.current.hasReadFailed).toBe(true));
      expect(mocks.post).toHaveBeenCalledTimes(1);
      expect(mocks.list).toHaveBeenCalledTimes(2);
      expect(result.current.hasSubmitFailed).toBe(outcome === 'reject');
      expect(result.current.fallback?.requestId).toBe(
        outcome === 'resolve' ? 'saved' : undefined,
      );
    },
  );
  it('canonical discovery dominates saved changes and remains visible when either read fails', async () => {
    mocks.list.mockResolvedValue({
      ...empty,
      operations: [
        { ...receipt, acceptedRequestIds: ['saved'], requestId: 'saved' },
      ],
    });
    const { result, rerender } = renderHook(
      (input) => useStoryboardCharacterReplacements(input),
      { initialProps: { ...props, saved } },
    );
    await waitFor(() =>
      expect(result.current.collection.operations).toHaveLength(1),
    );
    rerender({ ...props, saved: { ...saved, prompt: 'Later' } });
    expect(result.current.fallback).toBeUndefined();
    mocks.list.mockRejectedValueOnce(new Error('private read'));
    await act(async () => {
      await result.current.refreshRequests();
    });
    mocks.status.mockRejectedValueOnce(new Error('private status'));
    await act(async () => {
      await result.current.refreshStatus(receipt.operationId);
    });
    expect(result.current.collection.operations[0].requestId).toBe('saved');
    expect(result.current.hasReadFailed).toBe(true);
  });
  it.each(['brandId', 'runId', 'shotId'] as const)(
    'fences stale GET catch/finally on %s change',
    async (key) => {
      const old = deferred<typeof empty>();
      const next = deferred<typeof empty>();
      mocks.list
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise);
      const { result, rerender } = renderHook(
        (input) => useStoryboardCharacterReplacements(input),
        { initialProps: props },
      );
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
      const oldSignal = mocks.list.mock.calls[0][3] as AbortSignal;
      rerender({ ...props, [key]: 'new-scope' });
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
      expect(oldSignal.aborted).toBe(true);
      await act(async () => old.reject(new Error('old failure')));
      expect(result.current.isReading).toBe(true);
      expect(result.current.hasReadFailed).toBe(false);
      expect(result.current.collection).toEqual(empty);
      await act(async () => next.resolve(empty));
      expect(result.current.isReading).toBe(false);
    },
  );
  it.each(['resolve', 'reject'] as const)(
    'fences stale POST %s and finally while a new scope submits',
    async (outcome) => {
      const old = deferred<typeof saved>();
      const next = deferred<typeof saved>();
      mocks.post
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(next.promise);
      const { result, rerender } = renderHook(
        (input) => useStoryboardCharacterReplacements(input),
        { initialProps: props },
      );
      await waitFor(() => expect(result.current.isReading).toBe(false));
      let first: Promise<void> = Promise.resolve();
      act(() => {
        first = result.current.submit({ imageAssetIds: ['image'] });
      });
      await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
      rerender({ ...props, runId: 'new-run' });
      await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
      let second: Promise<void> = Promise.resolve();
      act(() => {
        second = result.current.submit({ imageAssetIds: ['image'] });
      });
      await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
      await act(async () => {
        if (outcome === 'resolve') old.resolve(saved);
        else old.reject(new Error('old failure'));
        await first;
      });
      expect(result.current.isSubmitting).toBe(true);
      expect(result.current.hasSubmitFailed).toBe(false);
      expect(result.current.fallback).toBeUndefined();
      expect(mocks.list).toHaveBeenCalledTimes(2);
      await act(async () => {
        next.resolve(saved);
        await second;
      });
      expect(mocks.list).toHaveBeenCalledTimes(3);
      expect(result.current.isSubmitting).toBe(false);
    },
  );
  it('a manual read does not invalidate same-scope POST completion and accepted fallback', async () => {
    const post = deferred<typeof saved>();
    mocks.post.mockReturnValueOnce(post.promise);
    const { result } = renderHook(() =>
      useStoryboardCharacterReplacements(props),
    );
    await waitFor(() => expect(result.current.isReading).toBe(false));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.submit({ imageAssetIds: ['image'] });
    });
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    await act(async () => {
      await result.current.refreshRequests();
    });
    await act(async () => {
      post.resolve(saved);
      await pending;
    });
    expect(result.current.fallback?.requestId).toBe('saved');
    expect(mocks.list).toHaveBeenCalledTimes(3);
  });
  it('fences awaited authentication before any request and aborts unmounted reads', async () => {
    const auth = deferred<Awaited<ReturnType<typeof mocks.auth>>>();
    mocks.auth.mockReturnValueOnce(auth.promise);
    const { rerender, unmount } = renderHook(
      (input) => useStoryboardCharacterReplacements(input),
      { initialProps: props },
    );
    rerender({ ...props, shotId: 'new-shot' });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
    await act(async () =>
      auth.resolve({ listStoryboardCharacterReplacements: mocks.list }),
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
    const signal = mocks.list.mock.calls[0][3] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});
