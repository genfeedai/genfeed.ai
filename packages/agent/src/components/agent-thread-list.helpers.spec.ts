import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadStatus } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  getThreadStatusKey,
  getThreadStatusMeta,
  groupAgentThreads,
  groupAgentThreadsByBrand,
  ORGANIZATION_THREAD_GROUP_LABEL,
  resolveThreadListPreview,
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

  it('uses the organization label when a thread has no brand', () => {
    const groups = groupAgentThreadsByBrand(
      [createThread('org', { brandId: null, title: 'Workspace chat' })],
      { searchQuery: '' },
    );

    expect(groups).toEqual([
      expect.objectContaining({
        brandId: null,
        label: ORGANIZATION_THREAD_GROUP_LABEL,
      }),
    ]);
  });

  it('keeps pinned threads first inside a brand group', () => {
    const groups = groupAgentThreadsByBrand(
      [
        createThread('later', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
          title: 'Later',
          updatedAt: '2026-08-19T12:00:00.000Z',
        }),
        createThread('pinned', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
          isPinned: true,
          title: 'Pinned',
          updatedAt: '2026-08-01T08:00:00.000Z',
        }),
      ],
      { searchQuery: '' },
    );

    expect(groups[0]?.threads.map(({ id }) => id)).toEqual(['pinned', 'later']);
  });
});

describe('resolveThreadListPreview', () => {
  it('uses the latest assistant output as the row description', () => {
    expect(
      resolveThreadListPreview(
        createThread('preview', {
          lastAssistantPreview: 'Three portraits are ready',
          lastMessage: 'older user prompt',
        }),
      ),
    ).toBe('Three portraits are ready');
  });

  it('does not fall back to source or platform noise', () => {
    expect(
      resolveThreadListPreview(
        createThread('empty', {
          platform: 'instagram',
          source: 'agent',
        }),
      ),
    ).toBeNull();
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

  it('lets reconciled local state settle stale active-thread attention', () => {
    const thread = createThread('active', {
      attentionState: 'running',
      runStatus: 'running',
    });

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'idle',
        activeThreadId: 'active',
      }),
    ).toBeNull();
  });

  it('does not leak the active thread failure status onto every thread', () => {
    const thread = createThread('background');

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'failed',
        activeThreadId: 'active-thread',
      }),
    ).toBeNull();
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
