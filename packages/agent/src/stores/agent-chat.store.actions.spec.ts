import type {
  AgentChatMessage,
  AgentInputRequest,
  AgentMemoryEntry,
  AgentProposedPlan,
  AgentUiAction,
  AgentWorkEvent,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TerminalSessionDto } from '@genfeedai/agent/stores/agent-chat.store';
import {
  AGENT_PANEL_OPEN_KEY,
  CONVERSATION_CACHE_FRESHNESS_MS,
  CONVERSATION_CACHE_LIMIT,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('persists a completed UI action across message row remounts', () => {
    const action: AgentUiAction = {
      id: 'brand-voice-card-1',
      title: 'Brand Voice Draft',
      type: 'brand_voice_profile_card',
    };
    const store = useAgentChatStore.getState();
    store.setMessages([
      makeMessage('m-1', { metadata: { uiActions: [action] } }),
    ]);
    store.addPendingUiActions([action]);

    useAgentChatStore
      .getState()
      .setUiActionStatus('brand-voice-card-1', 'completed');

    const state = useAgentChatStore.getState();
    expect(state.messages[0]?.metadata?.uiActions?.[0]?.status).toBe(
      'completed',
    );
    expect(state.stream.pendingUiActions[0]?.status).toBe('completed');
  });

  it('preserves message and stream references when an action id is absent', () => {
    const store = useAgentChatStore.getState();
    store.setMessages([makeMessage('m-1')]);
    store.addPendingUiActions([
      { id: 'other-action', type: 'completion_summary_card' },
    ]);
    const before = useAgentChatStore.getState();

    before.setUiActionStatus('missing-action', 'completed');

    const after = useAgentChatStore.getState();
    expect(after.messages).toBe(before.messages);
    expect(after.stream).toBe(before.stream);
  });

  it('updates matching message actions without replacing an unrelated pending stream', () => {
    const store = useAgentChatStore.getState();
    store.setMessages([
      makeMessage('m-1', {
        metadata: {
          uiActions: [
            { id: 'message-action', type: 'brand_voice_profile_card' },
          ],
        },
      }),
    ]);
    store.addPendingUiActions([
      { id: 'other-action', type: 'completion_summary_card' },
    ]);
    const before = useAgentChatStore.getState();

    before.setUiActionStatus('message-action', 'completed');

    const after = useAgentChatStore.getState();
    expect(after.messages).not.toBe(before.messages);
    expect(after.messages[0]?.metadata?.uiActions?.[0]?.status).toBe(
      'completed',
    );
    expect(after.stream).toBe(before.stream);
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

  it('setMessages clears stale pagination state from a prior page', () => {
    const store = useAgentChatStore.getState();
    store.setMessagesPage({
      hasMore: true,
      messages: [makeMessage('m-old')],
      nextCursor: 'cursor-old',
    });
    store.setIsLoadingOlderMessages(true);

    useAgentChatStore.getState().setMessages([makeMessage('m-replacement')]);

    const state = useAgentChatStore.getState();
    expect(state.messages.map((message) => message.id)).toEqual([
      'm-replacement',
    ]);
    expect(state.hasMoreMessages).toBe(false);
    expect(state.messagesCursor).toBeNull();
    expect(state.isLoadingOlderMessages).toBe(false);
  });

  it('sets an initial cursor page and prepends older messages without duplicates', () => {
    useAgentChatStore.getState().setMessagesPage({
      hasMore: true,
      messages: [makeMessage('m-2'), makeMessage('m-3')],
      nextCursor: 'cursor-2',
    });

    useAgentChatStore.getState().prependOlderMessages({
      hasMore: false,
      messages: [makeMessage('m-1'), makeMessage('m-2')],
      nextCursor: null,
    });

    const state = useAgentChatStore.getState();
    expect(state.messages.map((message) => message.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
    ]);
    expect(state.hasMoreMessages).toBe(false);
    expect(state.messagesCursor).toBeNull();
  });

  it('clearMessages resets conversation state', () => {
    const store = useAgentChatStore.getState();
    store.addMessage(makeMessage('m-1'));
    store.setActiveRun('run-1', { startedAt: '2026-03-26T10:00:00.000Z' });
    store.setDraftPlanModeEnabled(true);
    store.setError('Previous conversation failed');
    store.setIsGenerating(true);
    store.setThreadUiBusy('thread-1', true);
    store.setIsLoadingOlderMessages(true);

    useAgentChatStore.getState().clearMessages();

    const state = useAgentChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.activeRunId).toBeNull();
    expect(state.activeRunStatus).toBe('idle');
    expect(state.runStartedAt).toBeNull();
    expect(state.draftPlanModeEnabled).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isGenerating).toBe(false);
    expect(state.threadUiBusyById).toEqual({});
    expect(state.hasMoreMessages).toBe(false);
    expect(state.messagesCursor).toBeNull();
    expect(state.isLoadingOlderMessages).toBe(false);
  });

  it('resetActiveConversationState also resets stream state', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('hello');
    store.setMessagesPage({
      hasMore: true,
      messages: [makeMessage('m-1')],
      nextCursor: 'cursor-1',
    });
    store.setIsLoadingOlderMessages(true);
    store.setError('Previous conversation failed');
    store.setIsGenerating(true);

    useAgentChatStore.getState().resetActiveConversationState();

    const state = useAgentChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.stream.streamingContent).toBe('');
    expect(state.stream.isStreaming).toBe(false);
    expect(state.hasMoreMessages).toBe(false);
    expect(state.messagesCursor).toBeNull();
    expect(state.isLoadingOlderMessages).toBe(false);
    expect(state.error).toBeNull();
    expect(state.isGenerating).toBe(false);
  });
});

describe('agent-chat.store stream state', () => {
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
  it('clears a stale active run without discarding completed work history', () => {
    const completedEvent = {
      createdAt: '2026-03-26T10:01:00.000Z',
      id: 'work-1',
      label: 'Generated image',
      status: AgentWorkEventStatus.COMPLETED,
      type: AgentWorkEventType.TOOL,
    } as AgentWorkEvent;

    useAgentChatStore.getState().setActiveRun('run-stale');
    useAgentChatStore.getState().setIsGenerating(true);
    useAgentChatStore.getState().setWorkEvents([completedEvent]);
    useAgentChatStore.setState((state) => ({
      stream: {
        ...state.stream,
        isStreaming: true,
        streamingContent: 'stale partial response',
      },
    }));

    useAgentChatStore.getState().clearStaleActiveRun();

    const state = useAgentChatStore.getState();
    expect(state.activeRunId).toBeNull();
    expect(state.activeRunStatus).toBe('idle');
    expect(state.isGenerating).toBe(false);
    expect(state.runStartedAt).toBeNull();
    expect(state.stream.isStreaming).toBe(false);
    expect(state.stream.streamingContent).toBe('');
    expect(state.workEvents).toEqual([completedEvent]);
  });

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
  it('clears live stream state when switching between threads', () => {
    const store = useAgentChatStore.getState();
    store.setActiveThread('thread-image');
    store.addPendingUiActions([
      {
        generationType: 'image',
        id: 'generation-image',
        title: 'Configure image',
        type: 'generation_action_card',
      },
    ]);
    store.setActiveThread('thread-video');

    expect(useAgentChatStore.getState().activeThreadId).toBe('thread-video');
    expect(useAgentChatStore.getState().stream.pendingUiActions).toEqual([]);
  });

  it('keeps a live stream when the first thread id lands after /agent/new', () => {
    const store = useAgentChatStore.getState();
    store.addPendingUiActions([
      {
        generationType: 'video',
        id: 'generation-new',
        title: 'Configure video',
        type: 'generation_action_card',
      },
    ]);
    store.setActiveThread('thread-created');

    expect(useAgentChatStore.getState().stream.pendingUiActions).toEqual([
      expect.objectContaining({ id: 'generation-new' }),
    ]);
  });

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
  function makeInputRequest(id: string): AgentInputRequest {
    return {
      inputRequestId: id,
      prompt: 'Pick one',
      threadId: 'thread-1',
      title: 'Input needed',
    };
  }

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
    store.setMessagesPage({
      hasMore: true,
      messages: [makeMessage('m-1'), makeMessage('m-2')],
      nextCursor: 'cursor-2',
    });
    store.setLatestProposedPlan(makePlan('plan-1'));
    store.setWorkEvents([makeWorkEvent('w-1')]);
    store.setPendingInputRequest(makeInputRequest('req-1'));
    store.setError('Stored terminal failure');

    useAgentChatStore.getState().cacheConversation('thread-1');
    useAgentChatStore.getState().resetActiveConversationState();
    expect(useAgentChatStore.getState().messages).toHaveLength(0);
    useAgentChatStore.getState().setError('Another conversation failed');
    useAgentChatStore.getState().setIsGenerating(true);

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-1'),
    ).toBe(true);

    const state = useAgentChatStore.getState();
    expect(state.messages.map((message) => message.id)).toEqual(['m-1', 'm-2']);
    expect(state.latestProposedPlan?.summary).toBe('Plan plan-1');
    expect(state.workEvents.map((event) => event.id)).toEqual(['w-1']);
    expect(state.pendingInputRequest?.inputRequestId).toBe('req-1');
    expect(state.hasMoreMessages).toBe(true);
    expect(state.messagesCursor).toBe('cursor-2');
    expect(state.error).toBe('Stored terminal failure');
    expect(state.isGenerating).toBe(false);
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
    for (let index = 0; index < CONVERSATION_CACHE_LIMIT + 1; index += 1) {
      useAgentChatStore.getState().setMessages([makeMessage(`m-${index}`)]);
      useAgentChatStore.getState().cacheConversation(`thread-${index}`);
    }

    expect(
      useAgentChatStore.getState().restoreCachedConversation('thread-0'),
    ).toBe(false);
    expect(
      useAgentChatStore
        .getState()
        .restoreCachedConversation(`thread-${CONVERSATION_CACHE_LIMIT}`),
    ).toBe(true);
  });

  it('re-caching an existing thread refreshes its recency', () => {
    useAgentChatStore.getState().setMessages([makeMessage('m-0')]);
    useAgentChatStore.getState().cacheConversation('thread-0');

    for (let index = 1; index < CONVERSATION_CACHE_LIMIT; index += 1) {
      useAgentChatStore.getState().setMessages([makeMessage(`m-${index}`)]);
      useAgentChatStore.getState().cacheConversation(`thread-${index}`);
    }

    // thread-0 is the oldest entry — touching it must move it out of the
    // eviction slot, otherwise the next cache write would drop it.
    useAgentChatStore.getState().setMessages([makeMessage('m-0-again')]);
    useAgentChatStore.getState().cacheConversation('thread-0');

    useAgentChatStore
      .getState()
      .setMessages([makeMessage(`m-${CONVERSATION_CACHE_LIMIT}`)]);
    useAgentChatStore
      .getState()
      .cacheConversation(`thread-${CONVERSATION_CACHE_LIMIT}`);

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

  describe('primeConversationCache (#2790 prefetch)', () => {
    function makePrefetchedData(id: string) {
      return {
        error: null,
        hasMoreMessages: true,
        latestProposedPlan: null,
        messages: [makeMessage(id)],
        messagesCursor: `cursor-${id}`,
        pendingInputRequest: null,
        workEvents: [],
      };
    }

    it('writes prefetched data so it can later be restored', () => {
      useAgentChatStore
        .getState()
        .primeConversationCache('thread-hover', makePrefetchedData('m-hover'));

      expect(
        useAgentChatStore.getState().restoreCachedConversation('thread-hover'),
      ).toBe(true);
      expect(useAgentChatStore.getState().messages[0]?.id).toBe('m-hover');
      expect(useAgentChatStore.getState().hasMoreMessages).toBe(true);
      expect(useAgentChatStore.getState().messagesCursor).toBe(
        'cursor-m-hover',
      );
    });

    it('never overwrites the currently active thread', () => {
      useAgentChatStore.getState().setActiveThread('thread-active');
      useAgentChatStore.getState().setMessages([makeMessage('m-live')]);

      useAgentChatStore
        .getState()
        .primeConversationCache(
          'thread-active',
          makePrefetchedData('m-stale-prefetch'),
        );

      // A prefetch for the active thread must be dropped, not cached — the
      // live in-memory state is already the freshest available data, and
      // caching a snapshot here could later overwrite it with something
      // stale on a future restore.
      expect(
        useAgentChatStore.getState().restoreCachedConversation('thread-active'),
      ).toBe(false);
      expect(useAgentChatStore.getState().messages[0]?.id).toBe('m-live');
    });

    it('evicts the least recently primed thread past the limit', () => {
      for (let index = 0; index < CONVERSATION_CACHE_LIMIT + 1; index += 1) {
        useAgentChatStore
          .getState()
          .primeConversationCache(
            `thread-${index}`,
            makePrefetchedData(`m-${index}`),
          );
      }

      expect(
        useAgentChatStore.getState().restoreCachedConversation('thread-0'),
      ).toBe(false);
      expect(
        useAgentChatStore
          .getState()
          .restoreCachedConversation(`thread-${CONVERSATION_CACHE_LIMIT}`),
      ).toBe(true);
    });
  });

  describe('isConversationCacheFresh (#2790 warm-cache skip)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-26T10:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns false for a thread with no cache entry', () => {
      expect(
        useAgentChatStore.getState().isConversationCacheFresh('thread-none'),
      ).toBe(false);
    });

    it('returns true immediately after caching', () => {
      useAgentChatStore.getState().setMessages([makeMessage('m-1')]);
      useAgentChatStore.getState().cacheConversation('thread-1');

      expect(
        useAgentChatStore.getState().isConversationCacheFresh('thread-1'),
      ).toBe(true);
    });

    it('stays fresh just under the freshness window', () => {
      useAgentChatStore.getState().setMessages([makeMessage('m-1')]);
      useAgentChatStore.getState().cacheConversation('thread-1');

      vi.advanceTimersByTime(CONVERSATION_CACHE_FRESHNESS_MS - 1);

      expect(
        useAgentChatStore.getState().isConversationCacheFresh('thread-1'),
      ).toBe(true);
    });

    it('expires once the freshness window elapses, forcing a real refetch', () => {
      useAgentChatStore.getState().setMessages([makeMessage('m-1')]);
      useAgentChatStore.getState().cacheConversation('thread-1');

      vi.advanceTimersByTime(CONVERSATION_CACHE_FRESHNESS_MS);

      expect(
        useAgentChatStore.getState().isConversationCacheFresh('thread-1'),
      ).toBe(false);
    });
  });
});

// #2517 — a `requestAnimationFrame` per streamed token forced every
// historical timeline row to re-render/re-parse markdown dozens of times a
// second. `appendStreamToken` now buffers tokens in a module-scope array and
// flushes them as a single `setState()` call, raced between rAF and a
// `setTimeout` fallback. jsdom does not implement `requestAnimationFrame`, so
// it is stubbed here to queue (not synchronously invoke) callbacks — that is
// the only way to observe the "buffered, not yet flushed" intermediate state
// the rest of these tests depend on.
describe('agent-chat.store stream token buffering (#2517)', () => {
  let rafCallbacks: FrameRequestCallback[];
  let rafHandleCounter: number;

  function flushRaf(): void {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    for (const callback of callbacks) {
      callback(0);
    }
  }

  beforeEach(() => {
    rafCallbacks = [];
    rafHandleCounter = 0;
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        rafHandleCounter += 1;
        rafCallbacks.push(callback);
        return rafHandleCounter;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', (): void => {
      // Handles are not individually tracked — `schedulePendingStreamFlush`'s
      // own `hasRun` guard is what actually prevents a cancelled flush from
      // running, so a no-op stub still exercises the real safety property.
    });
  });

  afterEach(() => {
    // Discard while the fake clock/rAF stub are still installed so a flush
    // left pending by a test cannot leak a scheduled callback — and its
    // buffered tokens — into the next test.
    useAgentChatStore.getState().resetStreamState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('buffers multiple tokens and flushes them as one concatenated update', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('Hel');
    store.appendStreamToken('lo ');
    store.appendStreamToken('world');

    // Still buffered — no flush has run yet.
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');

    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'Hello world',
    );
  });

  it('preserves exact token order across many rapid appends', () => {
    const store = useAgentChatStore.getState();
    const tokens = Array.from({ length: 25 }, (_, index) => `t${index}-`);
    for (const token of tokens) {
      store.appendStreamToken(token);
    }

    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      tokens.join(''),
    );
  });

  it('falls back to the timer flush when rAF never fires (e.g. a hidden tab)', () => {
    useAgentChatStore.getState().appendStreamToken('fallback');

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');

    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'fallback',
    );
  });

  it('does not double-flush when both rAF and the timer fallback fire', () => {
    useAgentChatStore.getState().appendStreamToken('once');

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('once');
  });

  it('tokens appended after a flush start a fresh buffer instead of being dropped', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('first ');
    flushRaf();
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('first ');

    store.appendStreamToken('second');
    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'first second',
    );
  });

  it('a reset while tokens are buffered discards them instead of flushing stale content', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('half a sen');

    store.resetStreamState();

    // Neither the rAF nor the timer fallback should resurrect the discarded
    // buffer even if a callback was already queued at reset time.
    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });

  it('finalizeStream discards buffered tokens and uses the server-authoritative message content', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('stale locally-buffered text');

    store.finalizeStream(
      makeMessage('m-final', { content: 'server final content' }),
    );

    flushRaf();
    vi.advanceTimersByTime(50);

    const state = useAgentChatStore.getState();
    expect(state.stream.streamingContent).toBe('');
    expect(state.messages.at(-1)?.content).toBe('server final content');
  });

  it('resetActiveConversationState discards buffered tokens instead of flushing them', () => {
    useAgentChatStore.getState().appendStreamToken('half a sentence');

    useAgentChatStore.getState().resetActiveConversationState();

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });

  it('restoreCachedConversation discards buffered tokens instead of flushing them', () => {
    const store = useAgentChatStore.getState();
    store.setMessages([makeMessage('m-1')]);
    store.cacheConversation('thread-1');
    store.appendStreamToken('half a sentence');

    store.restoreCachedConversation('thread-1');

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });
});

// #2517 — a `requestAnimationFrame` per streamed token forced every
// historical timeline row to re-render/re-parse markdown dozens of times a
// second. `appendStreamToken` now buffers tokens in a module-scope array and
// flushes them as a single `setState()` call, raced between rAF and a
// `setTimeout` fallback. jsdom does not implement `requestAnimationFrame`, so
// it is stubbed here to queue (not synchronously invoke) callbacks — that is
// the only way to observe the "buffered, not yet flushed" intermediate state
// the rest of these tests depend on.
describe('agent-chat.store stream token buffering (#2517)', () => {
  let rafCallbacks: FrameRequestCallback[];
  let rafHandleCounter: number;

  function flushRaf(): void {
    const callbacks = rafCallbacks;
    rafCallbacks = [];
    for (const callback of callbacks) {
      callback(0);
    }
  }

  beforeEach(() => {
    rafCallbacks = [];
    rafHandleCounter = 0;
    vi.useFakeTimers();
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        rafHandleCounter += 1;
        rafCallbacks.push(callback);
        return rafHandleCounter;
      },
    );
    vi.stubGlobal('cancelAnimationFrame', (): void => {
      // Handles are not individually tracked — `schedulePendingStreamFlush`'s
      // own `hasRun` guard is what actually prevents a cancelled flush from
      // running, so a no-op stub still exercises the real safety property.
    });
  });

  afterEach(() => {
    // Discard while the fake clock/rAF stub are still installed so a flush
    // left pending by a test cannot leak a scheduled callback — and its
    // buffered tokens — into the next test.
    useAgentChatStore.getState().resetStreamState();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('buffers multiple tokens and flushes them as one concatenated update', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('Hel');
    store.appendStreamToken('lo ');
    store.appendStreamToken('world');

    // Still buffered — no flush has run yet.
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');

    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'Hello world',
    );
  });

  it('preserves exact token order across many rapid appends', () => {
    const store = useAgentChatStore.getState();
    const tokens = Array.from({ length: 25 }, (_, index) => `t${index}-`);
    for (const token of tokens) {
      store.appendStreamToken(token);
    }

    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      tokens.join(''),
    );
  });

  it('falls back to the timer flush when rAF never fires (e.g. a hidden tab)', () => {
    useAgentChatStore.getState().appendStreamToken('fallback');

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');

    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'fallback',
    );
  });

  it('does not double-flush when both rAF and the timer fallback fire', () => {
    useAgentChatStore.getState().appendStreamToken('once');

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('once');
  });

  it('tokens appended after a flush start a fresh buffer instead of being dropped', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('first ');
    flushRaf();
    expect(useAgentChatStore.getState().stream.streamingContent).toBe('first ');

    store.appendStreamToken('second');
    flushRaf();

    expect(useAgentChatStore.getState().stream.streamingContent).toBe(
      'first second',
    );
  });

  it('a reset while tokens are buffered discards them instead of flushing stale content', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('half a sen');

    store.resetStreamState();

    // Neither the rAF nor the timer fallback should resurrect the discarded
    // buffer even if a callback was already queued at reset time.
    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });

  it('finalizeStream discards buffered tokens and uses the server-authoritative message content', () => {
    const store = useAgentChatStore.getState();
    store.appendStreamToken('stale locally-buffered text');

    store.finalizeStream(
      makeMessage('m-final', { content: 'server final content' }),
    );

    flushRaf();
    vi.advanceTimersByTime(50);

    const state = useAgentChatStore.getState();
    expect(state.stream.streamingContent).toBe('');
    expect(state.messages.at(-1)?.content).toBe('server final content');
  });

  it('resetActiveConversationState discards buffered tokens instead of flushing them', () => {
    useAgentChatStore.getState().appendStreamToken('half a sentence');

    useAgentChatStore.getState().resetActiveConversationState();

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });

  it('restoreCachedConversation discards buffered tokens instead of flushing them', () => {
    const store = useAgentChatStore.getState();
    store.setMessages([makeMessage('m-1')]);
    store.cacheConversation('thread-1');
    store.appendStreamToken('half a sentence');

    store.restoreCachedConversation('thread-1');

    flushRaf();
    vi.advanceTimersByTime(50);

    expect(useAgentChatStore.getState().stream.streamingContent).toBe('');
  });
});
