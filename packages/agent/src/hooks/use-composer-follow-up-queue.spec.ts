import { useComposerFollowUpQueue } from '@genfeedai/agent/hooks/use-composer-follow-up-queue';
import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('useComposerFollowUpQueue', () => {
  it('queues while busy and flushes the next item once idle', () => {
    const onFlush = vi.fn<(item: ComposerFollowUp) => void>();
    const { rerender, result } = renderHook(
      ({ isIdle }: { isIdle: boolean }) =>
        useComposerFollowUpQueue({
          isIdle,
          onFlush,
          threadId: 'thread-1',
        }),
      { initialProps: { isIdle: false } },
    );

    act(() => {
      result.current.enqueue('first');
      result.current.enqueue('second');
    });

    expect(result.current.queue).toHaveLength(2);
    expect(onFlush).not.toHaveBeenCalled();

    rerender({ isIdle: true });

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]?.[0].content).toBe('first');
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.queue[0]?.content).toBe('second');
  });

  it('sendNow interrupts with that item and drops it from the queue', () => {
    const onFlush = vi.fn<(item: ComposerFollowUp) => void>();
    const { result } = renderHook(() =>
      useComposerFollowUpQueue({
        isIdle: false,
        onFlush,
        threadId: 'thread-1',
      }),
    );

    act(() => {
      result.current.enqueue('first');
      result.current.enqueue('second');
    });

    const secondId = result.current.queue[1]?.id;
    expect(secondId).toBeDefined();

    act(() => {
      result.current.sendNow(secondId ?? '');
    });

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]?.[0].content).toBe('second');
    expect(result.current.queue.map((item) => item.content)).toEqual(['first']);
  });

  it('clears the queue when the thread changes', () => {
    const { rerender, result } = renderHook(
      ({ threadId }: { threadId: string }) =>
        useComposerFollowUpQueue({
          isIdle: false,
          onFlush: vi.fn(),
          threadId,
        }),
      { initialProps: { threadId: 'thread-1' } },
    );

    act(() => {
      result.current.enqueue('keep me');
    });
    expect(result.current.queue).toHaveLength(1);

    rerender({ threadId: 'thread-2' });
    expect(result.current.queue).toHaveLength(0);
  });
});
