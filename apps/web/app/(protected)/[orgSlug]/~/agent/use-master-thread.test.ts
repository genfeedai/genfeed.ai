import type { AgentThread } from '@genfeedai/agent';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMasterThread } from './use-master-thread';

function makeThread(id: string): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-11-01T08:00:00Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-11-01T08:00:00Z',
  };
}

/** A master endpoint that answers with each id in turn, then fails. */
function makeApi(answers: string[]) {
  const queue = [...answers];
  return {
    getMasterThread: async (): Promise<AgentThread> => {
      const next = queue.shift();
      if (!next) {
        throw new Error('Failed to fetch master thread');
      }
      return makeThread(next);
    },
  };
}

describe('useMasterThread', () => {
  it('loads the master id on first mount', async () => {
    const api = makeApi(['master-1']);
    const { result } = renderHook(() => useMasterThread(api, true, 'acme'));

    expect(result.current).toEqual({
      hasFailed: false,
      isLoading: true,
      masterThreadId: null,
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        hasFailed: false,
        isLoading: false,
        masterThreadId: 'master-1',
      }),
    );
  });

  it('paints the remembered master on remount, then takes the server id', async () => {
    const api = makeApi(['master-1', 'master-2']);
    const first = renderHook(() => useMasterThread(api, true, 'acme'));
    await waitFor(() =>
      expect(first.result.current.masterThreadId).toBe('master-1'),
    );
    first.unmount();

    const second = renderHook(() => useMasterThread(api, true, 'acme'));
    expect(second.result.current).toEqual({
      hasFailed: false,
      isLoading: false,
      masterThreadId: 'master-1',
    });
    await waitFor(() =>
      expect(second.result.current.masterThreadId).toBe('master-2'),
    );
  });

  it('keeps the remembered master when the check fails', async () => {
    const api = makeApi(['master-1']);
    const first = renderHook(() => useMasterThread(api, true, 'acme'));
    await waitFor(() =>
      expect(first.result.current.masterThreadId).toBe('master-1'),
    );
    first.unmount();

    const second = renderHook(() => useMasterThread(api, true, 'acme'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(second.result.current).toEqual({
      hasFailed: false,
      isLoading: false,
      masterThreadId: 'master-1',
    });
  });

  it('never shows one organization the master of another', async () => {
    const api = makeApi(['acme-master', 'globex-master']);
    const first = renderHook(() => useMasterThread(api, true, 'acme'));
    await waitFor(() =>
      expect(first.result.current.masterThreadId).toBe('acme-master'),
    );
    first.unmount();

    const second = renderHook(() => useMasterThread(api, true, 'globex'));
    expect(second.result.current.masterThreadId).toBeNull();
    await waitFor(() =>
      expect(second.result.current.masterThreadId).toBe('globex-master'),
    );
  });
});
