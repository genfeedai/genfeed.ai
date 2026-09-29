import {
  findRecoveredAssistantMessage,
  flushBufferedEventsForThread,
  isForeignRunEvent,
  takeSourceActionUpdate,
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
  it('accepts an unstamped legacy reply written after the run started', () => {
    const messages = [assistant('legacy-reply')];

    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2')?.id,
    ).toBe('legacy-reply');
    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2', {
        notBefore: '2026-09-23T15:07:00.000Z',
      })?.id,
    ).toBe('legacy-reply');
  });

  it('never takes an unhydrated historical reply for a turn that started later', () => {
    const messages = [assistant('older-unstamped-reply')];

    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2', {
        notBefore: '2026-09-23T15:09:00.000Z',
      }),
    ).toBeUndefined();
  });

  it('matches a run that must be recovered by id only by its own reply', () => {
    const messages = [
      assistant('reply-run-2', 'run-2'),
      assistant('newer-unstamped-reply'),
    ];

    expect(
      findRecoveredAssistantMessage(messages, new Set(), 'run-2', {
        requireRunId: true,
      })?.id,
    ).toBe('reply-run-2');
    expect(
      findRecoveredAssistantMessage(
        [assistant('newer-unstamped-reply')],
        new Set(),
        'run-2',
        { requireRunId: true },
      ),
    ).toBeUndefined();
  });
});

describe('takeSourceActionUpdate', () => {
  it('splits the resolved source card out of the reply cards', () => {
    const source = {
      data: { decision: 'approved' },
      id: 'proposal-1',
      title: 'Generate image',
      type: 'generation_action_card' as const,
    };
    const next = {
      id: 'next-1',
      title: 'Next steps',
      type: 'next_steps_card' as const,
    };

    expect(takeSourceActionUpdate([source, next], 'proposal-1')).toEqual({
      card: source,
      replyActions: [next],
    });
  });
});
