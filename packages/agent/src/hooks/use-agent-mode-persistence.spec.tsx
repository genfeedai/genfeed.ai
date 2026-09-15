import { useAgentModePersistence } from '@genfeedai/agent/hooks/use-agent-mode-persistence';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadMode } from '@genfeedai/contracts';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMe } = vi.hoisted(() => ({ findMe: vi.fn() }));
vi.mock('@services/organization/users.service', () => ({
  UsersService: { getInstance: () => ({ findMe }) },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('useAgentModePersistence', () => {
  beforeEach(() => {
    useAgentChatStore.setState({
      activeThreadId: null,
      draftAgentMode: AgentThreadMode.MANUAL,
      savedAgentMode: null,
      hasExplicitDraftAgentMode: false,
      error: null,
      threads: [],
    });
    findMe
      .mockReset()
      .mockResolvedValue({ settings: { agentMode: AgentThreadMode.MANUAL } });
  });
  it('serializes selections and rolls latest failure back to the last successful mode', async () => {
    const first = deferred<void>();
    const updateAgentMode = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockRejectedValueOnce(new Error('failed'));
    const api = {
      getToken: vi.fn().mockResolvedValue('token'),
      updateAgentMode,
    } as unknown as AgentApiService;
    const { result } = renderHook(() => useAgentModePersistence(api));
    await act(async () => {});
    let firstRequest: Promise<void>;
    let secondRequest: Promise<void>;
    act(() => {
      firstRequest = result.current(AgentThreadMode.AUTO);
      secondRequest = result.current(AgentThreadMode.PLAN);
    });
    await act(async () => {});
    expect(updateAgentMode).toHaveBeenCalledTimes(1);
    expect(useAgentChatStore.getState().draftAgentMode).toBe(
      AgentThreadMode.PLAN,
    );
    await act(async () => {
      first.resolve();
      await firstRequest;
      await secondRequest;
    });
    expect(updateAgentMode.mock.calls.map((call) => call[0])).toEqual([
      'auto',
      'plan',
    ]);
    expect(useAgentChatStore.getState()).toMatchObject({
      savedAgentMode: 'auto',
      draftAgentMode: 'auto',
      error: 'Failed to update agent mode.',
    });
  });
  it('does not write without a token and keeps an unknown default unhydrated', async () => {
    const updateAgentMode = vi.fn();
    const api = {
      getToken: vi.fn().mockResolvedValue(null),
      updateAgentMode,
    } as unknown as AgentApiService;
    const { result } = renderHook(() => useAgentModePersistence(api));
    await act(async () => result.current(AgentThreadMode.AUTO));
    expect(updateAgentMode).not.toHaveBeenCalled();
    expect(useAgentChatStore.getState()).toMatchObject({
      savedAgentMode: null,
      hasExplicitDraftAgentMode: false,
      draftAgentMode: 'manual',
    });
  });
  it('does not let delayed settings hydration overwrite an explicit selection', async () => {
    const hydration = deferred<{ settings: { agentMode: AgentThreadMode } }>();
    findMe.mockReturnValue(hydration.promise);
    const api = {
      getToken: vi.fn().mockResolvedValue('token'),
      updateAgentMode: vi.fn().mockResolvedValue({}),
    } as unknown as AgentApiService;
    const { result } = renderHook(() => useAgentModePersistence(api));
    await act(async () => {});
    await act(async () => result.current(AgentThreadMode.AUTO));
    await act(async () =>
      hydration.resolve({ settings: { agentMode: AgentThreadMode.PLAN } }),
    );
    expect(useAgentChatStore.getState()).toMatchObject({
      savedAgentMode: 'auto',
      draftAgentMode: 'auto',
    });
    act(() => useAgentChatStore.getState().clearMessages());
    expect(useAgentChatStore.getState().draftAgentMode).toBe('auto');
  });
  it('repairs a failed previous thread selection without overwriting the new thread', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'a',
      threads: [
        { id: 'a', mode: AgentThreadMode.MANUAL },
        { id: 'b', mode: AgentThreadMode.PLAN },
      ] as never,
    });
    const first = deferred<void>();
    const updateAgentMode = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({});
    const api = {
      getToken: vi.fn().mockResolvedValue('token'),
      updateAgentMode,
    } as unknown as AgentApiService;
    const { result } = renderHook(() => useAgentModePersistence(api));
    await act(async () => {});
    let firstRequest: Promise<void>;
    let secondRequest: Promise<void>;
    act(() => {
      firstRequest = result.current(AgentThreadMode.AUTO);
    });
    await act(async () => {});
    act(() => {
      useAgentChatStore.setState({
        activeThreadId: 'b',
        draftAgentMode: AgentThreadMode.PLAN,
      });
      secondRequest = result.current(AgentThreadMode.PLAN);
    });
    await act(async () => {
      first.reject(new Error('failed'));
      await firstRequest;
      await secondRequest;
    });
    expect(
      useAgentChatStore.getState().threads.find((thread) => thread.id === 'a')
        ?.mode,
    ).toBe('manual');
    expect(useAgentChatStore.getState()).toMatchObject({
      activeThreadId: 'b',
      draftAgentMode: 'plan',
      savedAgentMode: 'plan',
      error: null,
    });
  });
});
