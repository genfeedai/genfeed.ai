import type {
  AgentChatMessage,
  AgentMemoryEntry,
  AgentProposedPlan,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TerminalSessionDto } from '@genfeedai/agent/stores/agent-chat.store';
import {
  AGENT_PANEL_OPEN_KEY,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it } from 'vitest';

function makeMessage(
  id: string,
  overrides: Partial<AgentChatMessage> = {},
): AgentChatMessage {
  return {
    content: `message ${id}`,
    createdAt: '2026-03-26T10:00:00.000Z',
    id,
    role: 'assistant',
    threadId: 'thread-1',
    ...overrides,
  };
}

function makePlan(id: string): AgentProposedPlan {
  return {
    followUpQuestions: [],
    planId: id,
    steps: [{ description: 'Do a thing', title: 'Step 1' }],
    summary: `Plan ${id}`,
  } as unknown as AgentProposedPlan;
}

function makeThread(id: string) {
  return {
    contextVersion: 1,
    createdAt: '2026-03-26T10:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: `Thread ${id}`,
    updatedAt: '2026-03-26T10:00:00.000Z',
  };
}

function makeMemoryEntry(id: string): AgentMemoryEntry {
  return {
    content: `remember ${id}`,
    createdAt: '2026-03-26T10:00:00.000Z',
    id,
  } as unknown as AgentMemoryEntry;
}

function makeSession(id: string, threadId?: string): TerminalSessionDto {
  return {
    createdAt: '2026-03-26T10:00:00.000Z',
    cwd: '/workspace',
    id,
    kind: 'shell',
    threadId,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
});

describe('agent-chat.store messages and plans', () => {
  it('addMessage appends and captures proposed plans from metadata', () => {
    const plan = makePlan('plan-1');
    useAgentChatStore.getState().addMessage(makeMessage('m-1'));
    useAgentChatStore
      .getState()
      .addMessage(makeMessage('m-2', { metadata: { proposedPlan: plan } }));

    const state = useAgentChatStore.getState();
    expect(state.messages).toHaveLength(2);
    expect(state.latestProposedPlan).toEqual(plan);
  });

  it('setMessages derives the latest proposed plan from the newest message', () => {
    const older = makePlan('plan-old');
    const newer = makePlan('plan-new');
    useAgentChatStore
      .getState()
      .setMessages([
        makeMessage('m-1', { metadata: { proposedPlan: older } }),
        makeMessage('m-2'),
        makeMessage('m-3', { metadata: { proposedPlan: newer } }),
        makeMessage('m-4'),
      ]);

    expect(useAgentChatStore.getState().latestProposedPlan).toEqual(newer);
  });

  it('setMessages clears the plan when no message carries one', () => {
    useAgentChatStore.getState().setLatestProposedPlan(makePlan('plan-x'));
    useAgentChatStore.getState().setMessages([makeMessage('m-1')]);

    expect(useAgentChatStore.getState().latestProposedPlan).toBeNull();
  });

  it('clearMessages resets conversation state', () => {
    const store = useAgentChatStore.getState();
    store.addMessage(makeMessage('m-1'));
    store.setActiveRun('run-1', { startedAt: '2026-03-26T10:00:00.000Z' });
    store.setDraftPlanModeEnabled(true);
    store.setThreadUiBusy('thread-1', true);

    useAgentChatStore.getState().clearMessages();

    const state = useAgentChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.activeRunId).toBeNull();
    expect(state.activeRunStatus).toBe('idle');
    expect(state.runStartedAt).toBeNull();
    expect(state.draftPlanModeEnabled).toBe(false);
    expect(state.threadUiBusyById).toEqual({});
  });

  it('resetActiveConversationState also resets stream state', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('hello');
    store.addMessage(makeMessage('m-1'));

    useAgentChatStore.getState().resetActiveConversationState();

    const state = useAgentChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.stream.streamingContent).toBe('');
    expect(state.stream.isStreaming).toBe(false);
  });
});

describe('agent-chat.store stream state', () => {
  it('appendStreamToken concatenates tokens', () => {
    useAgentChatStore.getState().appendStreamToken('Hello ');
    useAgentChatStore.getState().appendStreamToken('world');

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'Hello world',
    );
  });

  it('setStreamingReasoning replaces reasoning content', () => {
    useAgentChatStore.getState().setStreamingReasoning('thinking...');

    expect(useAgentChatStore.getState().stream.streamingReasoning).toBe(
      'thinking...',
    );
  });

  it('updateActiveToolCall patches a matching tool call only', () => {
    const store = useAgentChatStore.getState();
    store.addActiveToolCall({
      arguments: {},
      id: 'call-1',
      name: 'generate',
      status: 'running',
    });
    store.addActiveToolCall({
      arguments: {},
      id: 'call-2',
      name: 'publish',
      status: 'running',
    });

    useAgentChatStore
      .getState()
      .updateActiveToolCall('call-1', { status: 'completed' });

    const calls = useAgentChatStore.getState().stream.activeToolCalls;
    expect(calls[0]?.status).toBe('completed');
    expect(calls[1]?.status).toBe('running');
  });

  it('resetStreamState clears the stream and keeps cancelling status', () => {
    useAgentChatStore.getState().setActiveRunStatus('cancelling');
    useAgentChatStore.getState().appendStreamToken('partial');

    useAgentChatStore.getState().resetStreamState();

    const state = useAgentChatStore.getState();
    expect(state.stream.streamingContent).toBe('');
    expect(state.activeRunStatus).toBe('cancelling');
    expect(state.workEvents).toEqual([]);
  });

  it('resetStreamState returns to idle for non-cancelling statuses', () => {
    useAgentChatStore.getState().setActiveRunStatus('running');
    useAgentChatStore.getState().resetStreamState();

    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
  });
});

describe('agent-chat.store run lifecycle', () => {
  it('setActiveRun defaults to running when a run id is set', () => {
    useAgentChatStore.getState().setActiveRun('run-1');

    const state = useAgentChatStore.getState();
    expect(state.activeRunId).toBe('run-1');
    expect(state.activeRunStatus).toBe('running');
    expect(state.runStartedAt).toBeNull();
  });

  it('setActiveRun honors explicit status and startedAt', () => {
    useAgentChatStore.getState().setActiveRun('run-2', {
      startedAt: '2026-03-26T10:00:00.000Z',
      status: 'cancelling',
    });

    const state = useAgentChatStore.getState();
    expect(state.activeRunStatus).toBe('cancelling');
    expect(state.runStartedAt).toBe('2026-03-26T10:00:00.000Z');
  });

  it('setActiveRun with null run id goes idle', () => {
    useAgentChatStore.getState().setActiveRun('run-1');
    useAgentChatStore.getState().setActiveRun(null);

    expect(useAgentChatStore.getState().activeRunStatus).toBe('idle');
  });

  it('setRunStartedAt stores the timestamp', () => {
    useAgentChatStore.getState().setRunStartedAt('2026-03-26T11:00:00.000Z');

    expect(useAgentChatStore.getState().runStartedAt).toBe(
      '2026-03-26T11:00:00.000Z',
    );
  });

  it('setError while running marks the run failed and stops generating', () => {
    useAgentChatStore.getState().setActiveRun('run-1');
    useAgentChatStore.getState().setIsGenerating(true);

    useAgentChatStore.getState().setError('Insufficient credits');

    const state = useAgentChatStore.getState();
    expect(state.error).toBe('Insufficient credits');
    expect(state.activeRunStatus).toBe('failed');
    expect(state.isGenerating).toBe(false);
  });

  it('setError leaves a completed run status untouched', () => {
    useAgentChatStore.getState().setActiveRunStatus('completed');
    useAgentChatStore.getState().setError('late error');

    expect(useAgentChatStore.getState().activeRunStatus).toBe('completed');
  });

  it('setError(null) clears the error without status changes', () => {
    useAgentChatStore.getState().setActiveRun('run-1');
    useAgentChatStore.getState().setError(null);

    const state = useAgentChatStore.getState();
    expect(state.error).toBeNull();
    expect(state.activeRunStatus).toBe('running');
  });

  it('pending input requests can be set and cleared', () => {
    useAgentChatStore.getState().setPendingInputRequest({
      id: 'req-1',
      prompt: 'Pick one',
    } as never);
    expect(useAgentChatStore.getState().pendingInputRequest).not.toBeNull();

    useAgentChatStore.getState().clearPendingInputRequest();
    expect(useAgentChatStore.getState().pendingInputRequest).toBeNull();
  });
});

describe('agent-chat.store simple setters', () => {
  it('covers scalar setters', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('thread-9');
    store.setIsGenerating(true);
    store.setCreditsRemaining(42);
    store.setModelCosts({ 'gpt-test': 3 });
    store.setThreadPrompt('thread-9', 'draft prompt');
    store.setSocketConnectionState('connected');
    store.setPageContext({ pathname: '/library' } as never);
    store.setDraftPlanModeEnabled(true);
    store.setLatestProposedPlan(makePlan('plan-z'));
    store.setWorkEvents([]);

    const state = useAgentChatStore.getState();
    expect(state.activeThreadId).toBe('thread-9');
    expect(state.isGenerating).toBe(true);
    expect(state.creditsRemaining).toBe(42);
    expect(state.modelCosts).toEqual({ 'gpt-test': 3 });
    expect(state.threadPrompts['thread-9']).toBe('draft prompt');
    expect(state.socketConnectionState).toBe('connected');
    expect(state.pageContext).toEqual({ pathname: '/library' });
    expect(state.draftPlanModeEnabled).toBe(true);
    expect(state.latestProposedPlan?.summary).toBe('Plan plan-z');
    expect(state.workEvents).toEqual([]);
  });

  it('setThreadUiBusy adds and removes per-thread busy flags', () => {
    useAgentChatStore.getState().setThreadUiBusy('t-1', true);
    useAgentChatStore.getState().setThreadUiBusy('t-2', true);
    expect(useAgentChatStore.getState().threadUiBusyById).toEqual({
      't-1': true,
      't-2': true,
    });

    useAgentChatStore.getState().setThreadUiBusy('t-1', false);
    expect(useAgentChatStore.getState().threadUiBusyById).toEqual({
      't-2': true,
    });
  });

  it('setThreadUiBusy ignores empty thread ids', () => {
    useAgentChatStore.getState().setThreadUiBusy('', true);

    expect(useAgentChatStore.getState().threadUiBusyById).toEqual({});
  });
});

describe('agent-chat.store panel open state', () => {
  it('setIsOpen persists the preference to localStorage', () => {
    useAgentChatStore.getState().setIsOpen(true);

    expect(useAgentChatStore.getState().isOpen).toBe(true);
    expect(window.localStorage.getItem(AGENT_PANEL_OPEN_KEY)).toBe('true');
  });

  it('toggleOpen flips and persists the preference', () => {
    useAgentChatStore.getState().setIsOpen(false);
    useAgentChatStore.getState().toggleOpen();

    expect(useAgentChatStore.getState().isOpen).toBe(true);
    expect(window.localStorage.getItem(AGENT_PANEL_OPEN_KEY)).toBe('true');

    useAgentChatStore.getState().toggleOpen();
    expect(useAgentChatStore.getState().isOpen).toBe(false);
  });

  it('marks user-changed when toggled during an overlay session', () => {
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    useAgentChatStore.getState().setIsOpen(true);

    expect(useAgentChatStore.getState().userChangedAgentDuringOverlay).toBe(
      true,
    );
  });
});

describe('agent-chat.store overlay sessions', () => {
  it('auto-collapses an open agent and restores it after the overlay ends', () => {
    useAgentChatStore.getState().setIsOpen(true);

    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    let state = useAgentChatStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.overlayAutoCollapsedAgent).toBe(true);
    expect(state.wasAgentOpenBeforeOverlay).toBe(true);

    useAgentChatStore.getState().endOverlaySession('overlay-1');
    state = useAgentChatStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.overlayActiveIds).toEqual([]);
    expect(state.overlayAutoCollapsedAgent).toBe(false);
  });

  it('does not restore the agent when the user changed it during the overlay', () => {
    useAgentChatStore.getState().setIsOpen(true);
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    useAgentChatStore.getState().setIsOpen(false);

    useAgentChatStore.getState().endOverlaySession('overlay-1');

    expect(useAgentChatStore.getState().isOpen).toBe(false);
  });

  it('keeps state for nested overlays until the last one ends', () => {
    useAgentChatStore.getState().setIsOpen(true);
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    useAgentChatStore.getState().beginOverlaySession('overlay-2');

    useAgentChatStore.getState().endOverlaySession('overlay-1');
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([
      'overlay-2',
    ]);
    expect(useAgentChatStore.getState().isOpen).toBe(false);

    useAgentChatStore.getState().endOverlaySession('overlay-2');
    expect(useAgentChatStore.getState().isOpen).toBe(true);
  });

  it('ignores duplicate begin and unknown end overlay ids', () => {
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([
      'overlay-1',
    ]);

    useAgentChatStore.getState().endOverlaySession('unknown');
    expect(useAgentChatStore.getState().overlayActiveIds).toEqual([
      'overlay-1',
    ]);
  });

  it('closed agent stays closed across an overlay session', () => {
    useAgentChatStore.getState().beginOverlaySession('overlay-1');
    expect(useAgentChatStore.getState().wasAgentOpenBeforeOverlay).toBe(false);

    useAgentChatStore.getState().endOverlaySession('overlay-1');
    expect(useAgentChatStore.getState().isOpen).toBe(false);
  });
});

describe('agent-chat.store threads', () => {
  it('setThreads, updateThread, and clearThreadAttention operate on the list', () => {
    useAgentChatStore
      .getState()
      .setThreads([
        { ...makeThread('t-1'), attentionState: 'needs_input' } as never,
        makeThread('t-2') as never,
      ]);

    useAgentChatStore.getState().updateThread('t-2', { title: 'Renamed' });
    useAgentChatStore.getState().clearThreadAttention('t-1');

    const threads = useAgentChatStore.getState().threads;
    expect(threads[0]).toMatchObject({ attentionState: null, id: 't-1' });
    expect(threads[1]).toMatchObject({ id: 't-2', title: 'Renamed' });
  });
});

describe('agent-chat.store memory entries', () => {
  it('set, add, and remove memory entries', () => {
    useAgentChatStore.getState().setMemoryEntries([makeMemoryEntry('mem-1')]);
    useAgentChatStore.getState().addMemoryEntry(makeMemoryEntry('mem-2'));

    expect(
      useAgentChatStore.getState().memoryEntries.map((entry) => entry.id),
    ).toEqual(['mem-2', 'mem-1']);

    useAgentChatStore.getState().removeMemoryEntry('mem-1');
    expect(
      useAgentChatStore.getState().memoryEntries.map((entry) => entry.id),
    ).toEqual(['mem-2']);
  });
});

describe('agent-chat.store onboarding', () => {
  it('setOnboardingStepStatus updates only the matching step', () => {
    useAgentChatStore
      .getState()
      .setOnboardingStepStatus('complete_company_info', 'completed');

    const steps = useAgentChatStore.getState().onboardingSteps;
    expect(
      steps.find((step) => step.id === 'complete_company_info')?.status,
    ).toBe('completed');
    expect(
      steps.find((step) => step.id === 'generate_first_image')?.status,
    ).toBe('pending');
  });

  it('setOnboardingChecklist applies payload with defaults', () => {
    useAgentChatStore.getState().setOnboardingChecklist({
      earnedCredits: 25,
      steps: [],
    });

    const state = useAgentChatStore.getState();
    expect(state.onboardingSteps).toEqual([]);
    expect(state.onboardingEarnedCredits).toBe(25);
    expect(state.onboardingTotalJourneyCredits).toBe(100);
    expect(state.onboardingSignupGiftCredits).toBe(0);
    expect(state.onboardingTotalVisibleCredits).toBe(100);
    expect(state.onboardingCompletionPercent).toBe(0);
  });

  it('setOnboardingChecklist honors explicit totals', () => {
    useAgentChatStore.getState().setOnboardingChecklist({
      completionPercent: 40,
      signupGiftCredits: 100,
      steps: [],
      totalJourneyCredits: 500,
      totalOnboardingCreditsVisible: 700,
    });

    const state = useAgentChatStore.getState();
    expect(state.onboardingTotalVisibleCredits).toBe(700);
    expect(state.onboardingCompletionPercent).toBe(40);
  });
});

describe('agent-chat.store composer seed', () => {
  it('seedComposer stores content with a nonce, clearComposerSeed removes it', () => {
    useAgentChatStore.getState().seedComposer('Write a post', 'thread-1');

    const seed = useAgentChatStore.getState().composerSeed;
    expect(seed?.content).toBe('Write a post');
    expect(seed?.threadId).toBe('thread-1');
    expect(typeof seed?.nonce).toBe('number');

    useAgentChatStore.getState().clearComposerSeed();
    expect(useAgentChatStore.getState().composerSeed).toBeNull();
  });

  it('seedComposer defaults the thread to null', () => {
    useAgentChatStore.getState().seedComposer('Quick idea');

    expect(useAgentChatStore.getState().composerSeed?.threadId).toBeNull();
  });
});

describe('agent-chat.store terminal sessions', () => {
  it('addTerminalSession registers sessions and dedupes by id', () => {
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));
    useAgentChatStore
      .getState()
      .addTerminalSession('global', makeSession('sess-2'));

    const map = useAgentChatStore.getState().terminalSessionsByThread;
    expect(map.get('thread-1')).toHaveLength(1);
    expect(map.get('global')).toHaveLength(1);
  });

  it('persists sessions to localStorage', () => {
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));

    const raw = window.localStorage.getItem('genfeed:terminal:sessions');
    expect(raw).toContain('sess-1');
  });

  it('setTerminalSessionsByThread bulk-replaces the map', () => {
    const map = new Map([['global', [makeSession('sess-9')]]]);
    useAgentChatStore.getState().setTerminalSessionsByThread(map);

    expect(
      useAgentChatStore.getState().terminalSessionsByThread.get('global'),
    ).toHaveLength(1);
  });

  it('removeTerminalSession drops the session and falls back the active id', () => {
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-2', 'thread-1'));
    useAgentChatStore.getState().setActiveTerminalSession('thread-1', 'sess-1');

    useAgentChatStore.getState().removeTerminalSession('thread-1', 'sess-1');

    const state = useAgentChatStore.getState();
    expect(state.terminalSessionsByThread.get('thread-1')).toHaveLength(1);
    expect(state.activeTerminalSessionByThread['thread-1']).toBe('sess-2');
  });

  it('removeTerminalSession deletes empty thread keys and active mapping', () => {
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));
    useAgentChatStore.getState().setActiveTerminalSession('thread-1', 'sess-1');

    useAgentChatStore.getState().removeTerminalSession('thread-1', 'sess-1');

    const state = useAgentChatStore.getState();
    expect(state.terminalSessionsByThread.has('thread-1')).toBe(false);
    expect(state.activeTerminalSessionByThread['thread-1']).toBeUndefined();
  });

  it('removeTerminalSession keeps the active id when a different session dies', () => {
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-1', 'thread-1'));
    useAgentChatStore
      .getState()
      .addTerminalSession('thread-1', makeSession('sess-2', 'thread-1'));
    useAgentChatStore.getState().setActiveTerminalSession('thread-1', 'sess-1');

    useAgentChatStore.getState().removeTerminalSession('thread-1', 'sess-2');

    expect(
      useAgentChatStore.getState().activeTerminalSessionByThread['thread-1'],
    ).toBe('sess-1');
  });
});

describe('agent-chat.store conversation cache', () => {
  function makeWorkEvent(id: string): AgentWorkEvent {
    return {
      createdAt: '2026-03-26T10:00:00.000Z',
      event: AgentWorkEventType.TOOL_COMPLETED,
      id,
      label: `Work ${id}`,
      status: AgentWorkEventStatus.COMPLETED,
      threadId: 'thread-1',
    };
  }

  it('caches the visible conversation and restores it verbatim', () => {
    const store = useAgentChatStore.getState();
    store.setMessages([makeMessage('m-1'), makeMessage('m-2')]);
    store.setLatestProposedPlan(makePlan('plan-1'));
    store.setWorkEvents([makeWorkEvent('w-1')]);
    store.setPendingInputRequest({ id: 'req-1', prompt: 'Pick one' } as never);

    useAgentChatStore.getState().cacheConversation('thread-1');
    useAgentChatStore.getState().resetActiveConversationState();
    expect(useAgentChatStore.getState().messages).toHaveLength(0);

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-1'),
    ).toBe(true);

    const state = useAgentChatStore.getState();
    expect(state.messages.map((message) => message.id)).toEqual(['m-1', 'm-2']);
    expect(state.latestProposedPlan?.summary).toBe('Plan plan-1');
    expect(state.workEvents.map((event) => event.id)).toEqual(['w-1']);
    expect(state.pendingInputRequest?.id).toBe('req-1');
  });

  it('restoreCachedConversation reports a miss without touching state', () => {
    useAgentChatStore.getState().setMessages([makeMessage('m-1')]);

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-absent'),
    ).toBe(false);
    expect(useAgentChatStore.getState().messages).toHaveLength(1);
  });

  it('never caches an empty conversation', () => {
    useAgentChatStore.getState().cacheConversation('thread-empty');

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-empty'),
    ).toBe(false);
  });

  it('restoring never revives stream or run state from the thread being left', () => {
    useAgentChatStore.getState().setMessages([makeMessage('m-1')]);
    useAgentChatStore.getState().cacheConversation('thread-1');

    useAgentChatStore.getState().setActiveRun('run-9');
    useAgentChatStore.getState().appendStreamToken('half a sentence');

    useAgentChatStore.getState().restoreCachedConversation('thread-1');

    const state = useAgentChatStore.getState();
    expect(state.stream.streamingContent).toBe('');
    expect(state.stream.isStreaming).toBe(false);
    expect(state.activeRunId).toBeNull();
    expect(state.activeRunStatus).toBe('idle');
  });

  it('evicts the least recently cached thread past the limit', () => {
    for (let index = 0; index < 11; index += 1) {
      useAgentChatStore.getState().setMessages([makeMessage(`m-${index}`)]);
      useAgentChatStore.getState().cacheConversation(`thread-${index}`);
    }

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-0'),
    ).toBe(false);
    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-10'),
    ).toBe(true);
  });

  it('re-caching an existing thread refreshes its recency', () => {
    useAgentChatStore.getState().setMessages([makeMessage('m-0')]);
    useAgentChatStore.getState().cacheConversation('thread-0');

    for (let index = 1; index < 10; index += 1) {
      useAgentChatStore.getState().setMessages([makeMessage(`m-${index}`)]);
      useAgentChatStore.getState().cacheConversation(`thread-${index}`);
    }

    // thread-0 is the oldest entry — touching it must move it out of the
    // eviction slot, otherwise the next cache write would drop it.
    useAgentChatStore.getState().setMessages([makeMessage('m-0-again')]);
    useAgentChatStore.getState().cacheConversation('thread-0');

    useAgentChatStore.getState().setMessages([makeMessage('m-10')]);
    useAgentChatStore.getState().cacheConversation('thread-10');

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-0'),
    ).toBe(true);
    expect(useAgentChatStore.getState().messages[0]?.id).toBe('m-0-again');
    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-1'),
    ).toBe(false);
  });

  it('clearConversationCache drops every cached thread', () => {
    useAgentChatStore.getState().setMessages([makeMessage('m-1')]);
    useAgentChatStore.getState().cacheConversation('thread-1');

    useAgentChatStore.getState().clearConversationCache();

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-1'),
    ).toBe(false);
  });
});
