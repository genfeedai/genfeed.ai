import { useComposerFollowUpQueue } from '@genfeedai/agent/hooks/use-composer-follow-up-queue';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { COMPOSER_FOLLOW_UP_QUEUE_CAPACITY } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('useComposerFollowUpQueue', () => {
  it('queues while busy and flushes the next item once auto-dispatch is allowed', async () => {
    const onDispatch = vi.fn<(item: ComposerFollowUp) => Promise<boolean>>(
      async () => true,
    );
    const { rerender, result } = renderHook(
      ({
        canAutoDispatch,
        isBusy,
      }: {
        canAutoDispatch: boolean;
        isBusy: boolean;
      }) =>
        useComposerFollowUpQueue({
          canAutoDispatch,
          isBusy,
          onDispatch,
          onInterrupt: vi.fn(async () => true),
          threadId: 'thread-1',
        }),
      { initialProps: { canAutoDispatch: false, isBusy: true } },
    );

    act(() => {
      result.current.enqueue('first');
      result.current.enqueue('second');
    });

    expect(result.current.queue).toHaveLength(2);
    expect(onDispatch).not.toHaveBeenCalled();

    rerender({ canAutoDispatch: true, isBusy: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(onDispatch.mock.calls[0]?.[0].content).toBe('first');
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0]?.content).toBe('second');
  });

  it('does not auto-dispatch after a failed run', async () => {
    const onDispatch = vi.fn<(item: ComposerFollowUp) => Promise<boolean>>(
      async () => true,
    );
    const { rerender, result } = renderHook(
      ({
        canAutoDispatch,
        isBusy,
      }: {
        canAutoDispatch: boolean;
        isBusy: boolean;
      }) =>
        useComposerFollowUpQueue({
          canAutoDispatch,
          isBusy,
          onDispatch,
          onInterrupt: vi.fn(async () => true),
          threadId: 'thread-1',
        }),
      { initialProps: { canAutoDispatch: false, isBusy: true } },
    );

    act(() => {
      result.current.enqueue('hold me');
    });

    rerender({ canAutoDispatch: false, isBusy: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onDispatch).not.toHaveBeenCalled();
    expect(result.current.queue.map((item) => item.content)).toEqual([
      'hold me',
    ]);
  });

  it('sendNow waits for interrupt acknowledgement before dispatching', async () => {
    const onDispatch = vi.fn<(item: ComposerFollowUp) => Promise<boolean>>(
      async () => true,
    );
    let resolveInterrupt: ((value: boolean) => void) | undefined;
    const onInterrupt = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveInterrupt = resolve;
        }),
    );
    const { rerender, result } = renderHook(
      ({ isBusy }: { isBusy: boolean }) =>
        useComposerFollowUpQueue({
          canAutoDispatch: false,
          isBusy,
          onDispatch,
          onInterrupt,
          threadId: 'thread-1',
        }),
      { initialProps: { isBusy: true } },
    );

    act(() => {
      result.current.enqueue('first');
      result.current.enqueue('second');
    });

    act(() => {
      result.current.promoteOldest();
    });

    expect(result.current.isInterrupting).toBe(true);
    expect(onDispatch).not.toHaveBeenCalled();
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.promoteOldest();
    });
    expect(onInterrupt).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInterrupt?.(true);
      await Promise.resolve();
    });
    expect(onDispatch).not.toHaveBeenCalled();

    rerender({ isBusy: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(onDispatch.mock.calls[0]?.[0].content).toBe('first');
    expect(result.current.isInterrupting).toBe(false);
    expect(result.current.queue.map((item) => item.content)).toEqual([
      'second',
    ]);
  });

  it('does not dispatch after a failed interrupt', async () => {
    const onDispatch = vi.fn<(item: ComposerFollowUp) => Promise<boolean>>(
      async () => true,
    );
    const { result } = renderHook(() =>
      useComposerFollowUpQueue({
        canAutoDispatch: false,
        isBusy: true,
        onDispatch,
        onInterrupt: vi.fn(async () => false),
        threadId: 'thread-1',
      }),
    );

    act(() => {
      result.current.enqueue('first');
    });
    await act(async () => {
      result.current.sendNow(result.current.queue[0]?.id ?? '');
      await Promise.resolve();
    });

    expect(result.current.isInterrupting).toBe(false);
    expect(onDispatch).not.toHaveBeenCalled();
    expect(result.current.queue).toHaveLength(1);
  });

  it('keeps a failed dispatch at the head and retries it without leapfrogging', async () => {
    const onDispatch = vi
      .fn<(item: ComposerFollowUp) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const { rerender, result } = renderHook(
      ({
        canAutoDispatch,
        isBusy,
      }: {
        canAutoDispatch: boolean;
        isBusy: boolean;
      }) =>
        useComposerFollowUpQueue({
          canAutoDispatch,
          isBusy,
          onDispatch,
          onInterrupt: vi.fn(async () => true),
          threadId: 'thread-1',
        }),
      { initialProps: { canAutoDispatch: false, isBusy: true } },
    );

    act(() => {
      result.current.enqueue('first');
      result.current.enqueue('second');
    });

    rerender({ canAutoDispatch: true, isBusy: false });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(result.current.queue[0]?.status).toBe('failed');
    expect(result.current.queue.map((item) => item.content)).toEqual([
      'first',
      'second',
    ]);

    rerender({ canAutoDispatch: true, isBusy: false });
    await act(async () => {
      await Promise.resolve();
    });
    expect(onDispatch).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.retry(result.current.queue[0]?.id ?? '');
      await Promise.resolve();
    });

    expect(onDispatch).toHaveBeenCalledTimes(2);
    expect(onDispatch.mock.calls[1]?.[0].content).toBe('first');
  });

  it('isolates queues by thread and migrates an unassigned queue', () => {
    const { rerender, result } = renderHook(
      ({ threadId }: { threadId: string | null }) =>
        useComposerFollowUpQueue({
          canAutoDispatch: false,
          isBusy: true,
          onDispatch: vi.fn(async () => true),
          onInterrupt: vi.fn(async () => true),
          threadId,
        }),
      { initialProps: { threadId: 'thread-1' as string | null } },
    );

    act(() => {
      result.current.enqueue('keep me');
    });
    expect(result.current.queue).toHaveLength(1);

    rerender({ threadId: 'thread-2' });
    expect(result.current.queue).toHaveLength(0);

    act(() => {
      result.current.enqueue('thread two');
    });
    rerender({ threadId: 'thread-1' });
    expect(result.current.queue.map((item) => item.content)).toEqual([
      'keep me',
    ]);

    rerender({ threadId: null });
    act(() => {
      result.current.enqueue('new chat');
    });
    rerender({ threadId: 'thread-3' });
    expect(result.current.queue.map((item) => item.content)).toEqual([
      'new chat',
    ]);
  });

  it('rejects enqueue beyond capacity without mutating the queue', () => {
    const { result } = renderHook(() =>
      useComposerFollowUpQueue({
        canAutoDispatch: false,
        isBusy: true,
        onDispatch: vi.fn(async () => true),
        onInterrupt: vi.fn(async () => true),
        threadId: 'thread-1',
      }),
    );

    act(() => {
      for (
        let index = 0;
        index < COMPOSER_FOLLOW_UP_QUEUE_CAPACITY;
        index += 1
      ) {
        result.current.enqueue(`prompt-${index}`);
      }
    });
    expect(result.current.queue).toHaveLength(
      COMPOSER_FOLLOW_UP_QUEUE_CAPACITY,
    );

    let overflow: { accepted: boolean; reason?: string } = { accepted: true };
    act(() => {
      overflow = result.current.enqueue('overflow');
    });
    expect(overflow).toEqual({ accepted: false, reason: 'capacity' });
    expect(result.current.queue).toHaveLength(
      COMPOSER_FOLLOW_UP_QUEUE_CAPACITY,
    );
  });

  it('blocks enqueue and dispatch for read-only conversations', () => {
    const onDispatch = vi.fn<(item: ComposerFollowUp) => Promise<boolean>>(
      async () => true,
    );
    const { result } = renderHook(() =>
      useComposerFollowUpQueue({
        canAutoDispatch: true,
        isBusy: false,
        isReadOnly: true,
        onDispatch,
        onInterrupt: vi.fn(async () => true),
        threadId: 'thread-1',
      }),
    );

    let enqueueResult: { accepted: boolean; reason?: string } = {
      accepted: true,
    };
    act(() => {
      enqueueResult = result.current.enqueue('nope');
    });
    expect(enqueueResult).toEqual({ accepted: false, reason: 'blocked' });
    expect(result.current.queue).toHaveLength(0);
    expect(onDispatch).not.toHaveBeenCalled();
  });
});
