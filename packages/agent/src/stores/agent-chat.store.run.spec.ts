import {
  type RunStateSlice,
  recordOf,
  selectActiveRun,
  selectIsGenerating,
} from '@genfeedai/agent/stores/agent-chat.store.run';
import { describe, expect, it } from 'vitest';

describe('run selectors', () => {
  const state: RunStateSlice = {
    activeThreadId: 'thread-1',
    runsByThread: {
      'thread-1': {
        isGenerating: true,
        runId: 'run-1',
        startedAt: '2026-10-04T10:00:00.000Z',
        status: 'running',
      },
    },
    threads: [],
  };

  it('reads the visible thread record', () => {
    expect(selectActiveRun(state)).toEqual({
      isGenerating: true,
      runId: 'run-1',
      startedAt: '2026-10-04T10:00:00.000Z',
      status: 'running',
    });
    expect(selectIsGenerating(state)).toBe(true);
  });

  it('reports a thread without a record as idle', () => {
    expect(recordOf(state, 'thread-2')).toMatchObject({
      runId: null,
      status: 'idle',
    });
  });
});
