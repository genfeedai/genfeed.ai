import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentRuntimeState, AgentThreadStatus } from '@genfeedai/contracts';
import { AGENT_THREAD_STATUS_EVENT_TYPE } from '@genfeedai/contracts/constants';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';
import {
  AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS,
  useAgentThreadStatusPush,
} from './use-agent-thread-status-push';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

const socket = vi.hoisted(() => ({
  connectionState: 'connected' as ConnectionState,
  handlers: new Map<string, (payload: unknown) => void>(),
  subscribe: vi.fn(),
}));
const runtime = vi.hoisted(() => ({
  findAgentStreamEntry: vi.fn(),
}));
const metrics = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: socket.connectionState,
    isReady: true,
    subscribe: socket.subscribe,
  }),
}));
vi.mock('./agent-chat-stream.runtime', () => ({
  findAgentStreamEntry: runtime.findAgentStreamEntry,
}));
vi.mock('@genfeedai/services/core/agent-thread-status-metrics.service', () => ({
  countAgentThreadStatusClient: metrics.count,
}));

const thread = (id: string, overrides: Partial<AgentThread> = {}) =>
  ({
    contextVersion: 1,
    createdAt: '2026-09-29T08:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-09-29T08:00:00.000Z',
    ...overrides,
  }) as AgentThread;

const statusEvent = (
  overrides: Partial<AgentThreadStatusEvent> = {},
): AgentThreadStatusEvent => ({
  organizationId: 'org-1',
  pendingInputCount: 0,
  runStatus: 'running',
  runtimeState: AgentRuntimeState.RUNNING,
  sequence: 5,
  threadId: 'a',
  timestamp: '2026-09-29T08:01:00.000Z',
  userId: 'user-1',
  ...overrides,
});

const push = (event: AgentThreadStatusEvent) =>
  act(() => {
    socket.handlers.get(AGENT_THREAD_STATUS_EVENT_TYPE)?.(event);
  });
const row = (id: string) =>
  useAgentChatStore.getState().threads.find((item) => item.id === id);

describe('useAgentThreadStatusPush', () => {
  let reloadThreads: Mock<() => Promise<boolean>>;

  const mount = (isActive = true) =>
    renderHook(
      ({ active }) =>
        useAgentThreadStatusPush({ isActive: active, reloadThreads }),
      { initialProps: { active: isActive } },
    );

  beforeEach(() => {
    vi.useFakeTimers();
    socket.connectionState = 'connected';
    socket.handlers.clear();
    socket.subscribe
      .mockReset()
      .mockImplementation(
        (event: string, handler: (payload: unknown) => void) => {
          socket.handlers.set(event, handler);
          return () => socket.handlers.delete(event);
        },
      );
    runtime.findAgentStreamEntry.mockReset().mockReturnValue(undefined);
    metrics.count.mockReset();
    reloadThreads = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore
      .getState()
      .setThreads([thread('a', { statusSequence: 2 }), thread('b')]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes once for the session, not once per thread', () => {
    mount();

    expect(socket.subscribe).toHaveBeenCalledTimes(1);
    expect(socket.subscribe).toHaveBeenCalledWith(
      AGENT_THREAD_STATUS_EVENT_TYPE,
      expect.any(Function),
    );
  });

  it('does not subscribe while the sidebar is inactive, and unsubscribes on unmount', () => {
    const { unmount } = mount(false);
    expect(socket.subscribe).not.toHaveBeenCalled();
    unmount();

    const active = mount();
    expect(socket.handlers.size).toBe(1);
    active.unmount();
    expect(socket.handlers.size).toBe(0);
  });

  it('shows a run started elsewhere under Working, then clears it when it finishes', () => {
    mount();

    push(statusEvent({ sequence: 5 }));
    expect(row('a')).toMatchObject({
      attentionState: 'running',
      runStatus: 'running',
    });

    push(
      statusEvent({
        runStatus: 'completed',
        runtimeState: AgentRuntimeState.COMPLETED,
        sequence: 8,
      }),
    );
    expect(row('a')).toMatchObject({
      attentionState: null,
      runStatus: 'completed',
    });
    expect(metrics.count).toHaveBeenCalledWith('applied');
  });

  it('ignores an event that is not newer, and counts it as out of order', () => {
    mount();
    push(statusEvent({ sequence: 5 }));

    push(
      statusEvent({
        runStatus: 'failed',
        runtimeState: AgentRuntimeState.FAILED,
        sequence: 5,
      }),
    );
    push(statusEvent({ runStatus: 'idle', sequence: 3 }));

    expect(row('a')?.runStatus).toBe('running');
    expect(metrics.count).toHaveBeenCalledWith('dropped_out_of_order');
    expect(
      metrics.count.mock.calls.filter(([m]) => m === 'dropped_out_of_order'),
    ).toHaveLength(2);
  });

  it('does not let a push overwrite a live stream that is ahead of it', () => {
    runtime.findAgentStreamEntry.mockReturnValue({ terminalAt: null });
    useAgentChatStore.setState({ threadEventSequenceById: { a: 9 } });
    mount();

    push(statusEvent({ sequence: 7 }));
    expect(row('a')?.runStatus).toBeUndefined();

    push(statusEvent({ sequence: 10 }));
    expect(row('a')?.runStatus).toBe('running');
  });

  it('applies a push to a thread whose stream already ended, whatever the stream reached', () => {
    runtime.findAgentStreamEntry.mockReturnValue({ terminalAt: 123 });
    useAgentChatStore.setState({ threadEventSequenceById: { a: 9 } });
    mount();

    push(statusEvent({ sequence: 7 }));

    expect(row('a')?.runStatus).toBe('running');
  });

  it('reloads the list once for a burst of events about unknown threads', () => {
    mount();

    push(statusEvent({ threadId: 'elsewhere-1' }));
    push(statusEvent({ threadId: 'elsewhere-2' }));
    expect(reloadThreads).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(reloadThreads).toHaveBeenCalledTimes(1);
    expect(useAgentChatStore.getState().threads).toHaveLength(2);
    expect(metrics.count).toHaveBeenCalledWith('unknown_thread');
  });

  it('does not reload again for an unresolved ID after a successful reload', async () => {
    mount();
    push(statusEvent({ threadId: 'outside-page' }));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    push(statusEvent({ threadId: 'outside-page', sequence: 6 }));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(reloadThreads).toHaveBeenCalledTimes(1);
  });

  it('allows an unresolved ID to retry after a failed reload', async () => {
    reloadThreads.mockResolvedValueOnce(false);
    mount();
    push(statusEvent({ threadId: 'outside-page' }));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    push(statusEvent({ threadId: 'outside-page', sequence: 6 }));
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(reloadThreads).toHaveBeenCalledTimes(2);
  });

  describe('reconnect', () => {
    it('reloads the list when the channel connects, and again on every reconnect', () => {
      socket.connectionState = 'connecting';
      const { rerender } = mount();
      expect(reloadThreads).not.toHaveBeenCalled();

      socket.connectionState = 'connected';
      rerender({ active: true });
      expect(reloadThreads).toHaveBeenCalledTimes(1);

      socket.connectionState = 'reconnecting';
      rerender({ active: true });
      socket.connectionState = 'connected';
      rerender({ active: true });
      expect(reloadThreads).toHaveBeenCalledTimes(2);
      expect(metrics.count).toHaveBeenCalledWith('reconnect_reload');
    });

    it('corrects a thread that ended during the disconnect within 5 seconds', async () => {
      useAgentChatStore
        .getState()
        .applyThreadStatusPush(statusEvent({ sequence: 5 }));
      expect(row('a')?.runStatus).toBe('running');
      reloadThreads.mockImplementation(async () => {
        // The server list the reconnect fetches: the run ended at sequence 9.
        useAgentChatStore.getState().setThreads([
          thread('a', {
            attentionState: null,
            runStatus: 'completed',
            statusSequence: 9,
          }),
          thread('b'),
        ]);
        return true;
      });

      socket.connectionState = 'reconnecting';
      const { rerender } = mount();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      socket.connectionState = 'connected';
      rerender({ active: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(row('a')).toMatchObject({
        attentionState: null,
        runStatus: 'completed',
      });
    });
  });

  describe('fallback refetch while the channel is unavailable', () => {
    it.each(['offline', 'reconnecting'] as const)(
      'refetches on an interval while %s and the sidebar is visible',
      (state) => {
        socket.connectionState = state;
        mount();

        act(() => {
          vi.advanceTimersByTime(AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS * 2);
        });

        expect(reloadThreads).toHaveBeenCalledTimes(2);
        expect(metrics.count).toHaveBeenCalledWith('fallback_refetch');
      },
    );

    it('does not poll while the push channel is connected', () => {
      mount();

      act(() => {
        vi.advanceTimersByTime(AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS * 4);
      });

      expect(reloadThreads).not.toHaveBeenCalled();
    });

    it.each(['offline', 'reconnecting', 'connecting'] as const)(
      'refetches when the window regains focus while %s',
      (state) => {
        socket.connectionState = state;
        mount();

        act(() => {
          window.dispatchEvent(new Event('focus'));
        });

        expect(reloadThreads).toHaveBeenCalledTimes(1);
      },
    );

    it('does not refetch on focus while the push channel is connected', () => {
      mount();

      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(reloadThreads).not.toHaveBeenCalled();
    });

    it('stops refetching on focus once the sidebar is inactive', () => {
      socket.connectionState = 'offline';
      const { rerender } = mount();
      rerender({ active: false });

      act(() => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(reloadThreads).not.toHaveBeenCalled();
    });

    it('does not poll while the sidebar is hidden or the tab is in the background', () => {
      socket.connectionState = 'offline';
      const hidden = vi
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('hidden');
      const { rerender } = mount();

      act(() => {
        vi.advanceTimersByTime(AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS * 2);
      });
      expect(reloadThreads).not.toHaveBeenCalled();
      hidden.mockRestore();

      rerender({ active: false });
      act(() => {
        vi.advanceTimersByTime(AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS * 2);
      });
      expect(reloadThreads).not.toHaveBeenCalled();
    });

    it('shows no error when a fallback refetch fails', async () => {
      socket.connectionState = 'offline';
      reloadThreads.mockRejectedValue(new Error('network'));
      mount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          AGENT_THREAD_STATUS_FALLBACK_INTERVAL_MS,
        );
      });

      expect(useAgentChatStore.getState().error).toBeNull();
    });
  });
});
