import {
  type RunStateSlice,
  recordOf,
  selectActiveRun,
  selectIsGenerating,
} from '@genfeedai/agent/stores/agent-chat.store.run';
import { describe, expect, it } from 'vitest';

describe('run selectors on a state without runsByThread', () => {
  const partial: RunStateSlice = {
    activeRunId: 'run-1',
    activeRunStatus: 'running',
    activeThreadId: 'thread-1',
    isGenerating: true,
    runStartedAt: '2026-10-04T10:00:00.000Z',
    threads: [],
  };

  it('reads the compatibility fields', () => {
    expect(selectActiveRun(partial)).toEqual({
      isGenerating: true,
      runId: 'run-1',
      startedAt: '2026-10-04T10:00:00.000Z',
      status: 'running',
    });
    expect(selectIsGenerating(partial)).toBe(true);
  });

  it('reports a background thread as idle', () => {
    expect(recordOf(partial, 'thread-2')).toMatchObject({
      runId: null,
      status: 'idle',
    });
  });
});
