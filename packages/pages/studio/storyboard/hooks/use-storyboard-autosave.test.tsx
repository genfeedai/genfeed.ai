import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoryboardAutosave } from './use-storyboard-autosave';

describe('revision-aware storyboard autosave', () => {
  afterEach(() => vi.useRealTimers());
  it('debounces within two seconds and saves the latest edit', async () => {
    vi.useFakeTimers();
    const save = vi.fn(
      async ({ revision, value }: { revision: number; value: string }) => ({
        revision: revision + 1,
        value,
      }),
    );
    const { result } = renderHook(() =>
      useStoryboardAutosave({
        scope: 'run',
        initial: { revision: 1, value: 'First' },
        save,
      }),
    );
    act(() => {
      result.current.edit('Second');
      result.current.edit('Third');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toEqual({ revision: 1, value: 'Third' });
    expect(result.current).toMatchObject({
      value: 'Third',
      revision: 2,
      status: 'saved',
    });
  });
  it('serializes CAS requests and never overwrites text edited during an older response', async () => {
    let finish:
      | ((value: { revision: number; value: string }) => void)
      | undefined;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementationOnce(async ({ revision, value }) => ({
        revision: revision + 1,
        value,
      }));
    const { result } = renderHook(() =>
      useStoryboardAutosave({
        scope: 'run',
        initial: { revision: 1, value: 'First' },
        save,
      }),
    );
    act(() => result.current.edit('Second'));
    let pending: ReturnType<typeof result.current.flush>;
    act(() => {
      pending = result.current.flush();
    });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    act(() => result.current.edit('Third'));
    await act(async () => {
      finish?.({ revision: 2, value: 'SERVER SECOND' });
      await pending;
    });
    expect(save.mock.calls[1][0]).toEqual({ revision: 2, value: 'Third' });
    expect(result.current).toMatchObject({
      value: 'Third',
      revision: 3,
      status: 'saved',
    });
  });
  it('retains edits on conflicts and retries from the last acknowledged revision', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Revision conflict'))
      .mockResolvedValueOnce({ revision: 2, value: 'Kept' });
    const { result } = renderHook(() =>
      useStoryboardAutosave({
        scope: 'run',
        initial: { revision: 1, value: 'Original' },
        save,
      }),
    );
    act(() => result.current.edit('Kept'));
    await act(async () => {
      await expect(result.current.flush()).rejects.toThrow('Revision conflict');
    });
    expect(result.current).toMatchObject({
      value: 'Kept',
      revision: 1,
      status: 'failed',
      error: 'Revision conflict',
    });
    await act(async () => {
      await result.current.flush();
    });
    expect(save.mock.calls[1][0]).toEqual({ revision: 1, value: 'Kept' });
    expect(result.current.status).toBe('saved');
  });
  it('ignores late writes from a previous run scope', async () => {
    let finish:
      | ((value: { revision: number; value: string }) => void)
      | undefined;
    const save = vi.fn(
      () =>
        new Promise<{ revision: number; value: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ scope }) =>
        useStoryboardAutosave({
          scope,
          initial: { revision: 1, value: scope },
          save,
        }),
      { initialProps: { scope: 'old' } },
    );
    act(() => result.current.edit('Old dirty'));
    let pending: ReturnType<typeof result.current.flush>;
    act(() => {
      pending = result.current.flush();
    });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    rerender({ scope: 'new' });
    await act(async () => {
      finish?.({ revision: 2, value: 'Old server' });
      await pending.catch(() => undefined);
    });
    expect(result.current).toMatchObject({
      scope: 'new',
      value: 'new',
      revision: 1,
      status: 'saved',
    });
  });
  it('undoes the most recent persisted session edit as a new revision', async () => {
    const save = vi.fn(
      async ({ revision, value }: { revision: number; value: string }) => ({
        revision: revision + 1,
        value,
      }),
    );
    const { result } = renderHook(() =>
      useStoryboardAutosave({
        scope: 'run',
        initial: { revision: 1, value: 'Original' },
        save,
      }),
    );
    act(() => result.current.edit('Edited'));
    await act(async () => {
      await result.current.flush();
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(save.mock.calls[1][0]).toEqual({ revision: 2, value: 'Original' });
    expect(result.current).toMatchObject({
      value: 'Original',
      revision: 3,
      canUndo: false,
    });
  });
  it('keeps autosave active after StrictMode setup/cleanup', async () => {
    const save = vi.fn(
      async (
        { revision, value }: { revision: number; value: string },
        signal: AbortSignal,
      ) => {
        expect(signal.aborted).toBe(false);
        return { revision: revision + 1, value };
      },
    );
    const { result } = renderHook(
      () =>
        useStoryboardAutosave({
          scope: 'run',
          initial: { revision: 1, value: 'Original' },
          save,
        }),
      { wrapper: StrictMode },
    );
    act(() => result.current.edit('Edited'));
    await act(async () => {
      await result.current.flush();
    });
    expect(result.current.status).toBe('saved');
  });
});
