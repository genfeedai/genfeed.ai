import { describe, expect, it } from 'vitest';

import {
  normalizeAgentStructuredProgressEvent,
  normalizeBackgroundStructuredProgressEvent,
} from './structured-progress-event.util';

describe('structured-progress-event.util', () => {
  it('normalizes agent work events into a shared progress shape', () => {
    const result = normalizeAgentStructuredProgressEvent({
      debug: {
        parameters: { model: 'gpt-5.4' },
        rawOutput: 'tool stdout',
      },
      detail: 'Prepared generation payload',
      event: 'tool_started',
      label: 'Prepare Generation',
      phase: 'preparing',
      progress: 15,
      runId: 'run-1',
      startedAt: '2026-03-23T12:00:00.000Z',
      status: 'running',
      threadId: 'thread-1',
      timestamp: '2026-03-23T12:00:01.000Z',
      toolCallId: 'tool-1',
      toolName: 'prepare_generation',
    });

    expect(result).toEqual({
      debug: {
        parameters: { model: 'gpt-5.4' },
        rawOutput: 'tool stdout',
      },
      detail: 'Prepared generation payload',
      id: 'tool_started-tool-1',
      label: 'Prepare Generation',
      phase: 'preparing',
      progress: 15,
      runId: 'run-1',
      startedAt: '2026-03-23T12:00:00.000Z',
      status: 'running',
      threadId: 'thread-1',
      toolCallId: 'tool-1',
      toolName: 'prepare_generation',
    });
  });

  it('normalizes background task updates into the same progress shape', () => {
    const result = normalizeBackgroundStructuredProgressEvent({
      currentPhase: 'Generating image',
      estimatedDurationMs: 45_000,
      label: 'Image generation',
      progress: 35,
      remainingDurationMs: 28_000,
      startedAt: '2026-03-23T12:00:00.000Z',
      status: 'processing',
      taskId: 'task-1',
    });

    expect(result).toEqual({
      detail: undefined,
      estimatedDurationMs: 45_000,
      id: 'background-task-1',
      label: 'Image generation',
      phase: 'Generating image',
      progress: 35,
      remainingDurationMs: 28_000,
      startedAt: '2026-03-23T12:00:00.000Z',
      status: 'running',
      taskId: 'task-1',
    });
  });
});
