import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';
import { describe, expect, it } from 'vitest';
import { groupTimelineTurns } from './group-timeline-turns.util';

function userMessage(id: string): TimelineEntry {
  return {
    createdAt: '2026-08-13T00:00:00.000Z',
    id,
    kind: 'user-message',
    message: {
      content: id,
      createdAt: '2026-08-13T00:00:00.000Z',
      id,
      role: 'user',
      threadId: 't-1',
    },
  };
}

function assistantMessage(id: string): TimelineEntry {
  return {
    createdAt: '2026-08-13T00:00:01.000Z',
    id,
    kind: 'assistant-message',
    message: {
      content: id,
      createdAt: '2026-08-13T00:00:01.000Z',
      id,
      role: 'assistant',
      threadId: 't-1',
    },
  };
}

describe('groupTimelineTurns', () => {
  it('opens a new turn on every user message', () => {
    const turns = groupTimelineTurns([
      userMessage('u1'),
      assistantMessage('a1'),
      userMessage('u2'),
      assistantMessage('a2'),
    ]);

    expect(turns.map((turn) => turn.id)).toEqual(['u1', 'u2']);
    expect(turns[0]?.items.map((item) => item.entry.id)).toEqual(['u1', 'a1']);
    expect(turns[1]?.items.map((item) => item.entry.id)).toEqual(['u2', 'a2']);
  });

  it('keeps leading assistant rows in a prelude turn', () => {
    const turns = groupTimelineTurns([
      assistantMessage('a0'),
      userMessage('u1'),
    ]);

    expect(turns.map((turn) => turn.id)).toEqual(['a0', 'u1']);
  });
});
