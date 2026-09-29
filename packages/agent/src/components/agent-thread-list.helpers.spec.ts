import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  getThreadStatusKey,
  groupAgentThreads,
  groupAgentThreadsByBrand,
  ORGANIZATION_THREAD_GROUP_LABEL,
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

  it('moves a reconciled active thread out of Working despite stale server run status', () => {
    const thread = createThread('active', {
      runStatus: 'running',
    });

    const groups = groupAgentThreads([thread], {
      activeRunStatus: 'idle',
      activeThreadId: 'active',
      filter: 'all',
      isStreaming: false,
      searchQuery: '',
    });

    expect(groups.working).toEqual([]);
    expect(groups.recent).toEqual([thread]);
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

describe('groupAgentThreadsByBrand', () => {
  it('groups org-scope threads by brand label and sorts groups by latest activity', () => {
    const groups = groupAgentThreadsByBrand(
      [
        createThread('curie-old', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
          title: 'Older Curie chat',
          updatedAt: '2026-08-01T08:00:00.000Z',
        }),
        createThread('pascal', {
          brandId: 'brand-pascal',
          brandLabel: 'Pascal',
          title: 'Pascal chat',
          updatedAt: '2026-08-19T10:00:00.000Z',
        }),
        createThread('curie-new', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
          title: 'Newer Curie chat',
          updatedAt: '2026-08-19T12:00:00.000Z',
        }),
        createThread('org', {
          brandId: null,
          title: 'Org chat',
          updatedAt: '2026-08-18T10:00:00.000Z',
        }),
      ],
      { searchQuery: '' },
    );

    expect(groups.map((group) => group.label)).toEqual([
      'Curie',
      'Pascal',
      ORGANIZATION_THREAD_GROUP_LABEL,
    ]);
    expect(groups[0]?.threads.map(({ id }) => id)).toEqual([
      'curie-new',
      'curie-old',
    ]);
  });
});

describe('getThreadStatusKey', () => {
  it('maps running attention to the canonical running status', () => {
    expect(getThreadStatusKey({ attentionState: 'running' })).toBe('running');
  });

  it('maps needs-input and failed states to canonical icon statuses', () => {
    expect(getThreadStatusKey({ attentionState: 'needs-input' })).toBe(
      'pending_approval',
    );
    expect(getThreadStatusKey({ tone: 'failed' })).toBe('failed');
  });
});
