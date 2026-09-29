import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { buildThreadSummaryFromSnapshot } from '@genfeedai/agent/utils/agent-thread-snapshot.util';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getThreadStatusKey,
  getThreadStatusMeta,
  groupAgentThreads,
  groupAgentThreadsByBrand,
  keepNewerRunStatus,
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

  it('ignores the global run status: only the thread summary decides', () => {
    const running = createThread('running', { runStatus: 'running' });
    const completed = createThread('completed', { runStatus: 'completed' });

    const groups = groupAgentThreads([running, completed], {
      filter: 'all',
      searchQuery: '',
    });

    expect(groups.working).toEqual([running]);
    expect(groups.recent).toEqual([completed]);
  });

  it('sends a summary waiting on input to Needs you even while it is running', () => {
    const thread = createThread('waiting', {
      pendingInputCount: 1,
      runStatus: 'running',
    });

    const groups = groupAgentThreads([thread], {
      filter: 'all',
      searchQuery: '',
    });

    expect(groups.needsYou).toEqual([thread]);
    expect(groups.working).toEqual([]);
  });

  it('counts a locally busy thread as Working', () => {
    const thread = createThread('busy');

    const groups = groupAgentThreads([thread], {
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
  it('marks a running thread Running whatever its attention state', () => {
    for (const attentionState of ['running', null] as const) {
      expect(
        getThreadStatusMeta(
          createThread('t', { attentionState, runStatus: 'running' }),
        ),
      ).toEqual({ label: 'Running', tone: 'running' });
    }
  });

  it('shows nothing for a settled thread', () => {
    expect(
      getThreadStatusMeta(createThread('t', { runStatus: 'completed' })),
    ).toBeNull();
  });

  it('shows Failed only from the summary, never from another thread', () => {
    expect(
      getThreadStatusMeta(createThread('t', { runStatus: 'failed' })),
    ).toEqual({ label: 'Failed', tone: 'failed' });
    expect(getThreadStatusMeta(createThread('other'))).toBeNull();
  });

  it('labels what the thread is waiting for', () => {
    expect(
      getThreadStatusMeta(
        createThread('t', {
          pendingInputCount: 1,
          runtimeState: 'awaiting_confirmation',
        }),
      ),
    ).toEqual({ label: 'Awaiting confirmation', tone: 'warning' });
    expect(
      getThreadStatusMeta(createThread('t', { runStatus: 'waiting_input' })),
    ).toEqual({ label: 'Needs input', tone: 'warning' });
  });

  it('agrees with the grouping for every summary state', () => {
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

    for (const runStatus of runStatuses) {
      for (const pendingInputCount of [0, 1]) {
        for (const isLocallyBusy of [false, true]) {
          const thread = createThread('t', { pendingInputCount, runStatus });
          const groups = groupAgentThreads([thread], {
            filter: 'all',
            searchQuery: '',
            threadUiBusyById: { t: isLocallyBusy },
          });
          const tone = getThreadStatusMeta(thread, { isLocallyBusy })?.tone;

          expect(groups.working.length === 1).toBe(tone === 'running');
          expect(groups.needsYou.length === 1).toBe(tone === 'warning');
        }
      }
    }
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

describe('sidebar thread activity across thread switches (real store)', () => {
  const groupsNow = () =>
    groupAgentThreads(useAgentChatStore.getState().threads, {
      filter: 'all',
      searchQuery: '',
    });
  const workingIds = () => groupsNow().working.map(({ id }) => id);

  const cacheOneMessage = (threadId: string) => {
    const store = useAgentChatStore.getState();
    store.setMessagesPage({
      hasMore: false,
      messages: [
        {
          content: 'hello',
          createdAt: '2026-07-28T08:00:00.000Z',
          id: 'm-1',
          role: 'user',
          threadId,
        },
      ],
      nextCursor: null,
    });
    store.cacheConversation(threadId);
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
    store.setActiveThread('b');
    expect(workingIds()).toEqual(['a']);

    store.clearThreadAttention('a');
    store.setActiveThread('a');
    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
    expect(workingIds()).toEqual(['a']);
    expect(groupsNow().recent.map(({ id }) => id)).toEqual(['b']);
  });

  it('keeps a running thread in Working after a fresh-cache switch that skips the snapshot', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    cacheOneMessage('a');
    store.setActiveThread('b');
    store.setActiveThread('a');

    expect(store.restoreCachedConversation('a')).toBe(true);
    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
    expect(workingIds()).toEqual(['a']);
  });

  it('never writes the post-switch idle into the summary', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.setActiveRun('run-a');
    store.resetStreamState();
    store.resetActiveConversationState();
    store.clearMessages();

    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
    expect(workingIds()).toEqual(['a']);
  });

  it('moves the open thread out of Working when its run completes, fails or is cancelled', () => {
    for (const status of ['completed', 'failed', 'cancelled'] as const) {
      useAgentChatStore.setState({
        threads: [
          createThread('a', {
            attentionState: 'running',
            runStatus: 'running',
          }),
        ],
      });
      const store = useAgentChatStore.getState();
      store.setActiveThread('b');
      store.setActiveThread('a');
      store.setActiveRun('run-a');
      store.setActiveRunStatus(status);

      expect(workingIds()).toEqual([]);
      expect(useAgentChatStore.getState().threads[0]?.runStatus).toBe(status);
      store.setActiveRun(null);
    }
  });

  it('moves the open thread out of Working when an error settles its run', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.setActiveRun('run-a');
    store.setError('Out of credits');

    expect(workingIds()).toEqual([]);
    expect(useAgentChatStore.getState().threads[0]?.runStatus).toBe('failed');
  });

  it('sends the open thread to Needs you when its run awaits input, and back to Working when resumed', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.setActiveRun('run-a');
    store.setActiveRunStatus('awaiting_confirmation');

    expect(groupsNow().needsYou.map(({ id }) => id)).toEqual(['a']);
    expect(workingIds()).toEqual([]);

    store.setActiveRunStatus('running');
    expect(groupsNow().needsYou).toEqual([]);
    expect(workingIds()).toEqual(['a']);
  });

  it('keeps a thread waiting on the user in Needs you when the run then completes', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('a');
    store.updateThread('a', {
      attentionState: 'needs-input',
      pendingInputCount: 1,
      runStatus: 'waiting_input',
    });
    store.setActiveRun('run-a', { status: 'completed' });

    expect(groupsNow().needsYou.map(({ id }) => id)).toEqual(['a']);
  });

  it('moves a background thread to Recent when its run finishes while another is open', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    expect(workingIds()).toEqual(['a']);

    store.updateThread('a', {
      attentionState: 'updated',
      runStatus: 'completed',
    });

    expect(workingIds()).toEqual([]);
    expect(groupsNow().recent.map(({ id }) => id)).toEqual(['a', 'b']);
  });

  it('moves a background thread to Needs you when it starts waiting for input', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');

    store.updateThread('a', {
      attentionState: 'needs-input',
      pendingInputCount: 1,
      runStatus: 'waiting_input',
    });

    expect(groupsNow().needsYou.map(({ id }) => id)).toEqual(['a']);
    expect(workingIds()).toEqual([]);
  });

  it('clears a stale running summary once the snapshot reports the run ended', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    store.setActiveThread('a');
    expect(workingIds()).toEqual(['a']);

    store.upsertThread({
      ...createThread('a'),
      ...buildThreadSummaryFromSnapshot(
        {
          activeRun: { runId: 'run-a', startedAt: 'x', status: 'completed' },
          lastSequence: 1,
          pendingInputRequests: [],
          threadId: 'a',
        } as never,
        { isVisible: true },
      ),
    });

    expect(workingIds()).toEqual([]);
  });

  it('settles the summary when the stale active run is cleared', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('b');
    store.setActiveThread('a');
    store.setActiveRun('run-a');

    store.clearStaleActiveRun();

    expect(workingIds()).toEqual([]);
  });
});

describe('keepNewerRunStatus', () => {
  it('returns the listed row when it is at least as new as the held one', () => {
    const listed = createThread('a', {
      runStatus: 'completed',
      statusSequence: 7,
    });
    const held = createThread('a', { runStatus: 'running', statusSequence: 7 });

    expect(keepNewerRunStatus(listed, held)).toBe(listed);
    expect(keepNewerRunStatus(listed, undefined)).toBe(listed);
  });

  it('keeps the run status a newer push set, and the rest of the listed row', () => {
    const listed = createThread('a', {
      lastAssistantPreview: 'fresh preview',
      runStatus: 'running',
      statusSequence: 4,
    });
    const held = createThread('a', {
      attentionState: 'needs-input',
      pendingInputCount: 1,
      runStatus: 'waiting_input',
      runtimeState: 'awaiting_input',
      statusSequence: 6,
    });

    expect(keepNewerRunStatus(listed, held)).toMatchObject({
      attentionState: 'needs-input',
      lastAssistantPreview: 'fresh preview',
      pendingInputCount: 1,
      runStatus: 'waiting_input',
      runtimeState: 'awaiting_input',
      statusSequence: 6,
    });
  });
});
