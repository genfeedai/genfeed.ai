import type { AgentChatResult } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { announceUiActionRun } from '@api/services/agent-orchestrator/utils/agent-ui-action-announcement.util';
import { describe, expect, it, vi } from 'vitest';

function result(content: string): AgentChatResult {
  return {
    creditsRemaining: 90,
    creditsUsed: 0,
    message: { content, metadata: {}, role: 'assistant' },
    threadId: 'thread-1',
    toolCalls: [],
  };
}

/**
 * The thread log for two queued runs: each run's terminal event has its own
 * sequence, and the thread's latest sequence moves on as later runs finish.
 */
function threadLog() {
  const terminalSequenceByRun = new Map<string, number>();
  let lastSequence = 0;
  return {
    finish(runId: string) {
      lastSequence += 2;
      terminalSequenceByRun.set(runId, lastSequence);
    },
    recorder: {
      readLastSequence: vi.fn(async () => lastSequence),
      readRunTerminalSequence: vi.fn(async (params: { runId: string }) =>
        terminalSequenceByRun.get(params.runId),
      ),
      recordRunFailed: vi.fn(),
    },
  };
}

describe('announceUiActionRun', () => {
  it('tags each settlement with its own run’s terminal event, even when a later run finished first', async () => {
    const log = threadLog();
    const streamEffects = {
      publishUiActionDone: vi.fn(),
      publishUiActionFailure: vi.fn(),
    };
    const request = (sourceActionId: string) => ({
      action: 'confirm_mutation',
      payload: { approvalId: sourceActionId, sourceActionId },
      threadId: 'thread-1',
    });
    let releaseFirst: () => void = () => {};
    const firstPublished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    // Run A finishes in the lane, then run B finishes before A's settlement
    // is published.
    const first = announceUiActionRun({
      context: { executionId: 'exec-a', organizationId: 'org', userId: 'u' },
      request: request('card-a'),
      run: async () => {
        log.finish('exec-a');
        await firstPublished;
        return result('A done');
      },
      streamEffects,
      threadEventRecorder: log.recorder,
    });
    await announceUiActionRun({
      context: { executionId: 'exec-b', organizationId: 'org', userId: 'u' },
      request: request('card-b'),
      run: async () => {
        log.finish('exec-b');
        return result('B done');
      },
      streamEffects,
      threadEventRecorder: log.recorder,
    });
    releaseFirst();
    await first;

    const sequenceOf = (runId: string) =>
      streamEffects.publishUiActionDone.mock.calls.find(
        ([params]) => params.context.executionId === runId,
      )?.[0].sequence;
    expect(sequenceOf('exec-a')).toBe(2);
    expect(sequenceOf('exec-b')).toBe(4);
  });

  it('tags a failure with its run’s own terminal event', async () => {
    const log = threadLog();
    const streamEffects = {
      publishUiActionDone: vi.fn(),
      publishUiActionFailure: vi.fn(),
    };
    log.finish('exec-other');

    await expect(
      announceUiActionRun({
        context: { executionId: 'exec-a', organizationId: 'org', userId: 'u' },
        request: {
          action: 'approve_plan',
          payload: { planId: 'plan-1' },
          threadId: 'thread-1',
        },
        run: async () => {
          log.finish('exec-a');
          log.finish('exec-later');
          throw new Error('boom');
        },
        streamEffects,
        threadEventRecorder: log.recorder,
      }),
    ).rejects.toThrow('boom');

    expect(streamEffects.publishUiActionFailure).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 4 }),
    );
  });
});
