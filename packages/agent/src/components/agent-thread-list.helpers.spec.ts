import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  getThreadStatusDotClass,
  getThreadStatusMeta,
  groupAgentThreads,
} from './agent-thread-list.helpers';

function createThread(
  id: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-07-28T08:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-07-28T08:00:00.000Z',
    ...overrides,
  };
}

describe('groupAgentThreads', () => {
  const threads = [
    createThread('needs-input', {
      pendingInputCount: 1,
      runStatus: 'waiting_input',
    }),
    createThread('working', { runStatus: 'running' }),
    createThread('pinned', { isPinned: true }),
    createThread('recent', { lastAssistantPreview: 'Launch plan is ready' }),
  ];

  it('prioritizes attention and active execution before pinned and recent work', () => {
    const groups = groupAgentThreads(threads, {
      filter: 'all',
      searchQuery: '',
    });

    expect(groups.needsYou.map(({ id }) => id)).toEqual(['needs-input']);
    expect(groups.working.map(({ id }) => id)).toEqual(['working']);
    expect(groups.pinned.map(({ id }) => id)).toEqual(['pinned']);
    expect(groups.recent.map(({ id }) => id)).toEqual(['recent']);
  });

  it('searches thread title and preview content', () => {
    const groups = groupAgentThreads(threads, {
      filter: 'all',
      searchQuery: 'launch plan',
    });

    expect(groups.recent.map(({ id }) => id)).toEqual(['recent']);
    expect(groups.needsYou).toEqual([]);
    expect(groups.working).toEqual([]);
    expect(groups.pinned).toEqual([]);
  });

  it('keeps pinned filtering compatible with attention prioritization', () => {
    const groups = groupAgentThreads(
      [
        ...threads,
        createThread('pinned-needs-input', {
          isPinned: true,
          pendingInputCount: 1,
        }),
      ],
      {
        filter: 'pinned',
        searchQuery: '',
      },
    );

    expect(groups.needsYou.map(({ id }) => id)).toEqual(['pinned-needs-input']);
    expect(groups.pinned.map(({ id }) => id)).toEqual(['pinned']);
  });
});

describe('getThreadStatusMeta', () => {
  it('marks background attention running without requiring the thread to be active', () => {
    const thread = createThread('background', {
      attentionState: 'running',
      runStatus: 'running',
    });

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'idle',
        activeThreadId: 'other',
      }),
    ).toEqual({
      label: 'Running',
      shouldPulse: true,
      tone: 'running',
    });
  });

  it('ignores bare stale runStatus on non-active threads', () => {
    const thread = createThread('stale', {
      runStatus: 'running',
    });

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'idle',
        activeThreadId: 'other',
      }),
    ).toBeNull();
  });
});

describe('getThreadStatusDotClass', () => {
  it('uses a violet activity disc for running attention', () => {
    expect(getThreadStatusDotClass({ attentionState: 'running' })).toBe(
      'bg-violet-400',
    );
  });

  it('uses amber for needs-input and red for failed', () => {
    expect(getThreadStatusDotClass({ attentionState: 'needs-input' })).toBe(
      'bg-amber-300',
    );
    expect(getThreadStatusDotClass({ tone: 'failed' })).toBe('bg-red-400');
  });
});
