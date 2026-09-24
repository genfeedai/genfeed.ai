import {
  findRecoveredAssistantMessage,
  flushBufferedEventsForThread,
  isForeignRunEvent,
} from '@genfeedai/agent/hooks/agent-chat-stream.helpers';
import type { BufferedThreadEvent } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it, vi } from 'vitest';

function assistant(id: string, runId?: string): AgentChatMessage {
  return {
    content: id,
    createdAt: '2026-09-23T15:08:00.000Z',
    id,
    metadata: runId ? { runId } : undefined,
    role: 'assistant',
    threadId: 'thread-1',
  };
}

describe('isForeignRunEvent', () => {
  it('flags only events stamped with a different run than the tracked one', () => {
    expect(isForeignRunEvent('run-1', 'run-2')).toBe(true);
    expect(isForeignRunEvent('run-2', 'run-2')).toBe(false);
    expect(isForeignRunEvent(undefined, 'run-2')).toBe(false);
    expect(isForeignRunEvent('run-1', null)).toBe(false);
  });
});

describe('flushBufferedEventsForThread', () => {
  it('replays the tracked run, discards other runs, and keeps other threads', () => {
    const handler = vi.fn();
    const buffered: BufferedThreadEvent[] = [
      { data: 'stale', handler, runId: 'run-1', threadId: 'thread-1' },
      { data: 'current', handler, runId: 'run-2', threadId: 'thread-1' },
      { data: 'unstamped', handler, threadId: 'thread-1' },
      { data: 'elsewhere', handler, runId: 'run-9', threadId: 'thread-9' },
    ];

    const remaining = flushBufferedEventsForThread(
      buffered,
      'thread-1',
      'run-2',
    );

    expect(handler.mock.calls.map(([data]) => data)).toEqual([
      'current',
      'unstamped',
    ]);
    expect(remaining).toEqual([buffered[3]]);
  });
});

describe('findRecoveredAssistantMessage', () => {
  it('ignores a reply produced by another run on the same thread', () => {
    const messages = [
      assistant('reply-run-2', 'run-2'),
      assistant('reply-run-1', 'run-1'),
    ];

    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2')?.id,
    ).toBe('reply-run-2');
  });

  it('accepts replies without a run id for older persisted messages', () => {
    const messages = [assistant('legacy-reply')];

    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2')?.id,
    ).toBe('legacy-reply');
  });
});
