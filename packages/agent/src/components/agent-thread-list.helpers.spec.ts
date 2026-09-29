import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getThreadStatusKey,
  getThreadStatusMeta,
  groupAgentThreads,
  groupAgentThreadsByBrand,
  ORGANIZATION_THREAD_GROUP_LABEL,
  resolveThreadActivity,
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

  it('keeps a running active thread in Working when the store reset its run status to idle', () => {
    const thread = createThread('active', { runStatus: 'running' });

    const groups = groupAgentThreads([thread], {
      activeRunStatus: 'idle',
      activeThreadId: 'active',
      filter: 'all',
      isStreaming: false,
      searchQuery: '',
    });

    expect(groups.working).toEqual([thread]);
    expect(groups.recent).toEqual([]);
  });

  it('moves the active thread out of Working once its summary says the run ended', () => {
    const thread = createThread('active', { runStatus: 'completed' });

    const groups = groupAgentThreads([thread], {
      activeRunStatus: 'idle',
      activeThreadId: 'active',
      filter: 'all',
      searchQuery: '',
    });

    expect(groups.working).toEqual([]);
    expect(groups.recent).toEqual([thread]);
  });

  it('lets a definite settled local status clear a stale running summary', () => {
    const thread = createThread('active', { runStatus: 'running' });

    for (const activeRunStatus of [
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ] as const) {
      const groups = groupAgentThreads([thread], {
        activeRunStatus,
        activeThreadId: 'active',
        filter: 'all',
        searchQuery: '',
      });

      expect(groups.working).toEqual([]);
    }
  });

  it('keeps cancelling and streaming active threads in Working', () => {
    const thread = createThread('active');

    for (const options of [
      { activeRunStatus: 'cancelling' as const },
      { activeRunStatus: 'idle' as const, isStreaming: true },
    ]) {
      const groups = groupAgentThreads([thread], {
        ...options,
        activeThreadId: 'active',
        filter: 'all',
        searchQuery: '',
      });

      expect(groups.working).toEqual([thread]);
    }
  });

  it('sends an active thread awaiting input or confirmation to Needs you, not Working', () => {
    const thread = createThread('active', { runStatus: 'running' });

    for (const activeRunStatus of [
      'awaiting_input',
      'awaiting_confirmation',
    ] as const) {
      const groups = groupAgentThreads([thread], {
        activeRunStatus,
        activeThreadId: 'active',
        filter: 'all',
        searchQuery: '',
      });

      expect(groups.needsYou).toEqual([thread]);
      expect(groups.working).toEqual([]);
    }
  });

  it('sends a summary waiting on input to Needs you even while it is running', () => {
    const thread = createThread('waiting', {
      pendingInputCount: 1,
      runStatus: 'running',
    });

    const groups = groupAgentThreads([thread], {
      activeRunStatus: 'running',
      activeThreadId: 'waiting',
      filter: 'all',
      searchQuery: '',
    });

    expect(groups.needsYou).toEqual([thread]);
    expect(groups.working).toEqual([]);
  });

  it('does not let the open thread status leak onto other threads', () => {
    const groups = groupAgentThreads(
      [
        createThread('active'),
        createThread('background', { runStatus: 'running' }),
      ],
      {
        activeRunStatus: 'completed',
        activeThreadId: 'active',
        filter: 'all',
        searchQuery: '',
      },
    );

    expect(groups.working.map(({ id }) => id)).toEqual(['background']);
  });

  it('counts a locally busy thread as Working', () => {
    const thread = createThread('busy');

    const groups = groupAgentThreads([thread], {
      activeRunStatus: 'idle',
      activeThreadId: 'busy',
      filter: 'all',
      searchQuery: '',
      threadUiBusyById: { busy: true },
    });

    expect(groups.working).toEqual([thread]);
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
  it('marks a running background thread Running', () => {
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

  it('keeps the glyph running after attention was cleared by opening the thread', () => {
    const thread = createThread('opened', {
      attentionState: null,
      runStatus: 'running',
    });

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'idle',
        activeThreadId: 'opened',
      }),
    ).toEqual({ label: 'Running', tone: 'running' });
  });

  it('settles the active thread glyph from a definite local terminal status', () => {
    const thread = createThread('active', {
      attentionState: 'running',
      runStatus: 'running',
    });

    expect(
      getThreadStatusMeta(thread, {
        activeRunStatus: 'completed',
        activeThreadId: 'active',
      }),
    ).toBeNull();
  });

  it('labels an active thread awaiting confirmation from local state', () => {
    expect(
      getThreadStatusMeta(createThread('active', { runStatus: 'running' }), {
        activeRunStatus: 'awaiting_confirmation',
        activeThreadId: 'active',
      }),
    ).toEqual({ label: 'Awaiting confirmation', tone: 'warning' });
  });

  it('agrees with the grouping for every combination of summary and local status', () => {
    const runStatuses: AgentThread['runStatus'][] = [
      undefined,
      'idle',
      'queued',
      'running',
      'waiting_input',
      'completed',
      'failed',
      'cancelled',
    ];
    const localStatuses = [
      undefined,
      'idle',
      'running',
      'cancelling',
      'completed',
      'failed',
      'cancelled',
      'awaiting_input',
      'awaiting_confirmation',
      'interrupted',
      'restoring',
    ] as const;

    for (const runStatus of runStatuses) {
      for (const activeRunStatus of localStatuses) {
        for (const isActive of [true, false]) {
          const thread = createThread('t', { runStatus });
          const options = {
            activeRunStatus,
            activeThreadId: isActive ? 't' : 'other',
          };
          const groups = groupAgentThreads([thread], {
            ...options,
            filter: 'all',
            searchQuery: '',
          });
          const tone = getThreadStatusMeta(thread, options)?.tone;

          expect(groups.working.length === 1).toBe(tone === 'running');
          expect(groups.needsYou.length === 1).toBe(tone === 'warning');
        }
      }
    }
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

describe('thread activity across thread switches (real store)', () => {
  const activeGroups = () => {
    const state = useAgentChatStore.getState();
    return groupAgentThreads(state.threads, {
      activeRunStatus: state.activeRunStatus,
      activeThreadId: state.activeThreadId,
      filter: 'all',
      isStreaming: state.stream.isStreaming,
      searchQuery: '',
    });
  };

  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({
      threads: [
        createThread('a', { attentionState: 'running', runStatus: 'running' }),
        createThread('b'),
      ],
    });
  });

  it('keeps a running thread in Working when switching away and back', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.setActiveRun('run-a');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);

    store.setActiveThread('b');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);

    store.clearThreadAttention('a');
    store.setActiveThread('a');
    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);
    expect(activeGroups().recent.map(({ id }) => id)).toEqual(['b']);
  });

  it('keeps a running thread in Working after a fresh-cache switch that skips the snapshot', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.cacheConversation('a');
    store.setActiveThread('b');
    store.setActiveThread('a');

    expect(store.restoreCachedConversation('a')).toBe(true);
    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);
  });

  it('moves a background thread to Recent when its run finishes while another is open', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);

    store.updateThread('a', {
      attentionState: 'updated',
      runStatus: 'completed',
    });

    expect(activeGroups().working).toEqual([]);
    expect(activeGroups().recent.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('moves a background thread to Needs you when it starts waiting for input', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');

    store.updateThread('a', {
      attentionState: 'needs-input',
      pendingInputCount: 1,
      runStatus: 'waiting_input',
    });

    expect(activeGroups().needsYou.map(({ id }) => id)).toEqual(['a']);
    expect(activeGroups().working).toEqual([]);
  });

  it('clears a stale running summary once the snapshot reports the run ended', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    store.setActiveThread('a');
    expect(activeGroups().working.map(({ id }) => id)).toEqual(['a']);

    store.updateThread('a', { attentionState: null, runStatus: 'completed' });
    store.setActiveRun(null, { status: 'completed' });

    expect(activeGroups().working).toEqual([]);
  });

  it('settles the summary when the stale active run is cleared', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    store.setActiveThread('a');
    store.setActiveRun('run-a');

    store.clearStaleActiveRun();

    expect(activeGroups().working).toEqual([]);
  });
});

describe('resolveThreadActivity', () => {
  it('treats a missing context as summary-only', () => {
    expect(
      resolveThreadActivity(createThread('t', { runStatus: 'queued' })),
    ).toBe('working');
    expect(resolveThreadActivity(createThread('t'))).toBe('idle');
  });
});
