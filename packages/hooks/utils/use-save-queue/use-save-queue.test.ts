import { useSaveQueue } from '@hooks/utils/use-save-queue/use-save-queue';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
} {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((reason: Error) => void) | null = null;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    reject: (reason: Error) => reject?.(reason),
    resolve: (value: T) => resolve?.(value),
  };
}

describe('useSaveQueue', () => {
  it('runs a queued task and resolves with its result', async () => {
    const { result } = renderHook(() => useSaveQueue());

    let saved: string | undefined;

    await act(async () => {
      saved = await result.current.enqueueSave(async () => 'saved');
    });

    expect(saved).toBe('saved');
    expect(result.current.isSaving).toBe(false);
  });

  it('never runs two saves concurrently', async () => {
    const first = createDeferred<void>();
    const { result } = renderHook(() => useSaveQueue());

    const firstTask = vi.fn(() => first.promise);
    const secondTask = vi.fn(async () => undefined);

    let firstSave: Promise<void> | null = null;
    let secondSave: Promise<void> | null = null;

    act(() => {
      firstSave = result.current.enqueueSave(firstTask);
      secondSave = result.current.enqueueSave(secondTask);
    });

    await waitFor(() => {
      expect(firstTask).toHaveBeenCalledTimes(1);
    });
    expect(secondTask).not.toHaveBeenCalled();

    await act(async () => {
      first.resolve();
      await firstSave;
      await secondSave;
    });

    expect(secondTask).toHaveBeenCalledTimes(1);
  });

  it('reports isSaving until every queued save settles', async () => {
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    const { result } = renderHook(() => useSaveQueue());

    let firstSave: Promise<void> | null = null;
    let secondSave: Promise<void> | null = null;

    act(() => {
      firstSave = result.current.enqueueSave(() => first.promise);
      secondSave = result.current.enqueueSave(() => second.promise);
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      first.resolve();
      await firstSave;
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      second.resolve();
      await secondSave;
    });

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false);
    });
  });

  it('waitForIdle resolves only after queued saves settle, including failures', async () => {
    const pending = createDeferred<void>();
    const { result } = renderHook(() => useSaveQueue());

    const onIdle = vi.fn();

    let idlePromise: Promise<void> | null = null;
    let failingSave: Promise<void> | null = null;

    act(() => {
      failingSave = result.current.enqueueSave(() => pending.promise);
      idlePromise = result.current.waitForIdle().then(onIdle);
    });

    await Promise.resolve();
    expect(onIdle).not.toHaveBeenCalled();

    await act(async () => {
      pending.reject(new Error('save failed'));
      await failingSave?.catch(() => undefined);
      await idlePromise;
    });

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('rejects the failing save without blocking the next one', async () => {
    const { result } = renderHook(() => useSaveQueue());

    const failure = new Error('save failed');
    const secondTask = vi.fn(async () => 'second');

    let caught: unknown;
    let secondResult: string | undefined;

    await act(async () => {
      const failingSave = result.current
        .enqueueSave(async () => {
          throw failure;
        })
        .catch((error: unknown) => {
          caught = error;
        });
      const secondSave = result.current.enqueueSave(secondTask);

      await failingSave;
      secondResult = await secondSave;
    });

    expect(caught).toBe(failure);
    expect(secondTask).toHaveBeenCalledTimes(1);
    expect(secondResult).toBe('second');
    expect(result.current.isSaving).toBe(false);
  });
});
