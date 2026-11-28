import { WebSocketEventStatus } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { useVideoVersionRefresh } from '@hooks/ui/ingredient/use-video-version-refresh/use-video-version-refresh';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: { status: WebSocketEventStatus }) => void;

const listeners = new Map<string, Set<Handler>>();

function emit(path: string, status: WebSocketEventStatus) {
  for (const handler of [...(listeners.get(path) ?? [])]) {
    handler({ status });
  }
}

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => {
  const subscribe = (path: string, handler: Handler) => {
    const set = listeners.get(path) ?? new Set<Handler>();
    set.add(handler);
    listeners.set(path, set);
    return () => set.delete(handler);
  };
  return { useSocketManager: () => ({ subscribe }) };
});

const version = { id: 'version-1' } as IIngredient;
const path = (id: string) => `/videos/${id}`;

describe('useVideoVersionRefresh', () => {
  beforeEach(() => {
    listeners.clear();
  });

  it('refreshes at once and again when the version finishes', () => {
    const refreshes: string[] = [];
    const onRefresh = () => {
      refreshes.push('refresh');
    };
    const { result } = renderHook(() => useVideoVersionRefresh({ onRefresh }));

    result.current(version);
    expect(refreshes).toHaveLength(1);

    emit(path('version-1'), WebSocketEventStatus.PROGRESS);
    expect(refreshes).toHaveLength(1);

    emit(path('version-1'), WebSocketEventStatus.COMPLETED);
    expect(refreshes).toHaveLength(2);
    expect(listeners.get(path('version-1'))?.size).toBe(0);
  });

  it('refreshes when the version fails, so the card stops showing it as processing', () => {
    const refreshes: string[] = [];
    const onRefresh = () => {
      refreshes.push('refresh');
    };
    const { result } = renderHook(() => useVideoVersionRefresh({ onRefresh }));

    result.current(version);
    emit(path('version-1'), WebSocketEventStatus.FAILED);

    expect(refreshes).toHaveLength(2);
  });

  it('refreshes once and listens to nothing when the response has no version', () => {
    const refreshes: string[] = [];
    const onRefresh = () => {
      refreshes.push('refresh');
    };
    const { result } = renderHook(() => useVideoVersionRefresh({ onRefresh }));

    result.current(undefined);

    expect(refreshes).toHaveLength(1);
    expect(listeners.size).toBe(0);
  });

  it('stops listening when the list unmounts', () => {
    const refreshes: string[] = [];
    const onRefresh = () => {
      refreshes.push('refresh');
    };
    const { result, unmount } = renderHook(() =>
      useVideoVersionRefresh({ onRefresh }),
    );

    result.current(version);
    unmount();
    emit(path('version-1'), WebSocketEventStatus.COMPLETED);

    expect(refreshes).toHaveLength(1);
    expect(listeners.get(path('version-1'))?.size).toBe(0);
  });
});
