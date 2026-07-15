import type { AgentUIBlock } from '@genfeedai/interfaces';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAgentDashboardPersistence } from './use-agent-dashboard-persistence';

describe('useAgentDashboardPersistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not persist an unchanged default dashboard on mount', async () => {
    vi.useFakeTimers();
    const persistState = vi.fn().mockResolvedValue(undefined);
    const localSnapshot = {
      blocks: [] as AgentUIBlock[],
      isAgentModified: false,
    };

    renderHook(() =>
      useAgentDashboardPersistence({
        blocks: localSnapshot.blocks,
        currentUser: { id: 'user-1' },
        getLocalSnapshot: () => localSnapshot,
        hydrateState: vi.fn(),
        isAgentModified: localSnapshot.isAgentModified,
        persistState,
        scope: 'brand',
      }),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(701);
    });

    expect(persistState).not.toHaveBeenCalled();
  });
});
