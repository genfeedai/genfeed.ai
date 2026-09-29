import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { resolveRunSummaryPatch } from '@genfeedai/agent/utils/agent-thread-run-summary.util';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

function createThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-07-28T08:00:00.000Z',
    id: 'thread-1',
    status: AgentThreadStatus.ACTIVE,
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

describe('resolveRunSummaryPatch', () => {
  it.each(['idle', 'restoring'] as const)(
    'says nothing about the run for %s',
    (status) => {
      expect(
        resolveRunSummaryPatch(status, createThread({ runStatus: 'running' })),
      ).toBeNull();
    },
  );

  it.each(['running', 'cancelling'] as const)(
    'marks the thread running for %s and clears waiting state',
    (status) => {
      expect(
        resolveRunSummaryPatch(
          status,
          createThread({
            attentionState: 'needs-input',
            pendingInputCount: 1,
            runStatus: 'waiting_input',
          }),
        ),
      ).toEqual({
        attentionState: null,
        pendingInputCount: 0,
        runStatus: 'running',
        runtimeState: 'running',
      });
    },
  );

  it.each(['awaiting_input', 'awaiting_confirmation'] as const)(
    'marks the thread as needing the user for %s',
    (status) => {
      expect(
        resolveRunSummaryPatch(status, createThread({ runStatus: 'running' })),
      ).toEqual({
        attentionState: 'needs-input',
        pendingInputCount: 1,
        runStatus: 'waiting_input',
        runtimeState: status,
      });
    },
  );

  it.each([
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
    ['interrupted', 'cancelled'],
  ] as const)('settles a running thread on %s', (status, runStatus) => {
    expect(
      resolveRunSummaryPatch(status, createThread({ runStatus: 'running' })),
    ).toMatchObject({ runStatus, runtimeState: status });
  });

  it('never lets a terminal status overwrite a summary waiting on the user', () => {
    expect(
      resolveRunSummaryPatch(
        'completed',
        createThread({ pendingInputCount: 1, runStatus: 'waiting_input' }),
      ),
    ).toBeNull();
  });

  it('leaves a summary that already agrees on the run status alone', () => {
    for (const runStatus of ['queued', 'running'] as const) {
      expect(
        resolveRunSummaryPatch(
          'running',
          createThread({ attentionState: 'running', runStatus }),
        ),
      ).toBeNull();
    }
    expect(
      resolveRunSummaryPatch('failed', createThread({ runStatus: 'failed' })),
    ).toBeNull();
    expect(
      resolveRunSummaryPatch(
        'awaiting_input',
        createThread({ runStatus: 'waiting_input' }),
      ),
    ).toBeNull();
  });

  it('still clears pending input when running resumes a waiting summary', () => {
    expect(
      resolveRunSummaryPatch(
        'running',
        createThread({ pendingInputCount: 1, runStatus: 'running' }),
      ),
    ).toMatchObject({ pendingInputCount: 0, runStatus: 'running' });
  });
});
