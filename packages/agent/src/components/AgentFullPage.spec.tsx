import { conversationHydrationFlights } from '@genfeedai/agent/utils/conversation-hydration-flight';
import { THREAD_SWITCH_DEBOUNCE_MS } from '@genfeedai/agent/utils/plan-thread-switch-fetches';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationInspectorShellProvider } from './ConversationInspectorShellContext';

vi.mock('@ui/primitives', () => ({
  Drawer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@genfeedai/agent/components/AgentChatContainer', () => ({
  AgentChatContainer: (props: {
    emptyStateDescription?: string;
    emptyStateTitle?: string;
    isWideLayout?: boolean;
    isLoadingThread?: boolean;
    onboardingMode?: boolean;
    placeholder?: string;
    promptBarLayoutMode?: string;
    suggestedActions?: Array<{
      id?: string;
      label: string;
      prompt: string;
    }>;
    workspacePlanningTaskId?: string | null;
  }) => (
    <div>
      agent-chat-container
      {props.isLoadingThread ? ' loading-thread' : ''}
      <div>{props.emptyStateTitle}</div>
      <div>{props.emptyStateDescription}</div>
      <div>{props.onboardingMode ? 'onboarding-mode' : 'standard-mode'}</div>
      <div>{props.placeholder}</div>
      <div>{props.promptBarLayoutMode}</div>
      <div>{props.isWideLayout ? 'wide-layout' : 'standard-layout'}</div>
      <div>
        {props.workspacePlanningTaskId
          ? `planning-task-${props.workspacePlanningTaskId}`
          : 'no-planning-task'}
      </div>
      <div>
        {(props.suggestedActions ?? []).map((action) => (
          <span key={action.id ?? action.label}>{action.label}</span>
        ))}
      </div>
    </div>
  ),
}));

vi.mock('@genfeedai/agent/components/AgentOnboardingChecklist', () => ({
  AgentOnboardingChecklist: () => <div>agent-onboarding-checklist</div>,
}));

vi.mock('@genfeedai/agent/components/AgentOutputsPanel', () => ({
  AgentOutputsPanel: () => <div>agent-outputs-panel</div>,
}));

vi.mock('@genfeedai/agent/components/AgentSidebarContent', () => ({
  AgentSidebarContent: () => <div>agent-sidebar-content</div>,
}));

interface StoreState {
  activeRunId: string | null;
  activeThreadId: string | null;
  cacheConversation: ReturnType<typeof vi.fn>;
  clearComposerSeed: ReturnType<typeof vi.fn>;
  clearConversationCache: ReturnType<typeof vi.fn>;
  creditsRemaining: number | null;
  composerSeed: null;
  isConversationCacheFresh: ReturnType<typeof vi.fn>;
  messages: Array<{
    content: string;
    createdAt: string;
    id: string;
    metadata?: {
      suggestedActions?: Array<{
        id: string;
        label: string;
        prompt: string;
      }>;
      uiActions?: Array<{
        id: string;
        images?: string[];
        title: string;
        tweets?: string[];
        type: string;
      }>;
    };
    role: string;
    threadId: string;
  }>;
  modelCosts: Record<string, number>;
  onboardingSignupGiftCredits: number;
  onboardingSteps: Array<{
    id: string;
    status: 'pending' | 'in-progress' | 'complete';
  }>;
  onboardingTotalJourneyCredits: number;
  onboardingTotalVisibleCredits: number;
  pageContext: {
    placeholder?: string;
    route: string;
    suggestedActions: Array<{
      id?: string;
      label: string;
      prompt: string;
    }>;
  } | null;
  clearThreadAttention: ReturnType<typeof vi.fn>;
  resetStreamState: ReturnType<typeof vi.fn>;
  restoreCachedConversation: ReturnType<typeof vi.fn>;
  resetActiveConversationState: ReturnType<typeof vi.fn>;
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveThread: ReturnType<typeof vi.fn>;
  setCreditsRemaining: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setMessagesPage: ReturnType<typeof vi.fn>;
  setModelCosts: ReturnType<typeof vi.fn>;
  setDraftPlanModeEnabled: ReturnType<typeof vi.fn>;
  setLatestProposedPlan: ReturnType<typeof vi.fn>;
  setPendingInputRequest: ReturnType<typeof vi.fn>;
  setRunStartedAt: ReturnType<typeof vi.fn>;
  setThreadPrompt: ReturnType<typeof vi.fn>;
  setWorkEvents: ReturnType<typeof vi.fn>;
  seedComposer: ReturnType<typeof vi.fn>;
  stream: { isStreaming: boolean };
  threads: Array<{
    brandId?: string | null;
    id: string;
    planModeEnabled?: boolean;
    source?: string;
  }>;
  upsertThread: ReturnType<typeof vi.fn>;
}

const storeState: StoreState = {
  activeRunId: null,
  activeThreadId: null,
  cacheConversation: vi.fn(),
  clearComposerSeed: vi.fn(),
  clearConversationCache: vi.fn(),
  clearThreadAttention: vi.fn(),
  composerSeed: null,
  creditsRemaining: null,
  isConversationCacheFresh: vi.fn(() => false),
  messages: [],
  modelCosts: {},
  onboardingSignupGiftCredits: 0,
  onboardingSteps: [],
  onboardingTotalJourneyCredits: 100,
  onboardingTotalVisibleCredits: 100,
  pageContext: null,
  resetActiveConversationState: vi.fn(),
  resetStreamState: vi.fn(),
  restoreCachedConversation: vi.fn(() => false),
  seedComposer: vi.fn(),
  setActiveRun: vi.fn(),
  setActiveThread: vi.fn(),
  setCreditsRemaining: vi.fn(),
  setDraftPlanModeEnabled: vi.fn(),
  setError: vi.fn(),
  setLatestProposedPlan: vi.fn(),
  setMessagesPage: vi.fn(),
  setModelCosts: vi.fn(),
  setPendingInputRequest: vi.fn(),
  setRunStartedAt: vi.fn(),
  setThreadPrompt: vi.fn(),
  setWorkEvents: vi.fn(),
  stream: { isStreaming: false },
  threads: [],
  upsertThread: vi.fn(),
};

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => {
  const useAgentChatStore = Object.assign(
    (selector: (state: StoreState) => unknown) => selector(storeState),
    {
      getState: () => storeState,
    },
  );

  return { useAgentChatStore };
});

const setupStatusState = {
  brand: undefined,
  completenessScore: null,
  connectedConnections: [],
  connectedPlatformsCount: 0,
  hasConnectedChannels: false,
  isBrandComplete: false,
  isSetupComplete: false,
  showSetupPanel: false,
};

vi.mock('@genfeedai/agent/components/useAgentSetupStatus', () => ({
  useAgentSetupStatus: () => setupStatusState,
}));

vi.mock('@genfeedai/agent/components/AgentSetupPanel', () => ({
  AgentSetupPanel: () => <div>agent-setup-panel</div>,
}));

vi.mock('@genfeedai/agent/components/AgentThreadContextPanel', () => ({
  default: () => <div>agent-thread-context-panel</div>,
}));

let AgentFullPage: typeof import('@genfeedai/agent/components/AgentFullPage').AgentFullPage;

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    getCreditsInfo: vi.fn().mockResolvedValue({ balance: 50, modelCosts: {} }),
    getMessagesPage: vi
      .fn()
      .mockResolvedValue({ hasMore: false, messages: [], nextCursor: null }),
    getThread: vi.fn(),
    getThreadSnapshot: vi.fn(),
    ...overrides,
  };
}

function createAbortAwareValue<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      resolve(value);
    }, 0);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

describe('AgentFullPage', () => {
  beforeEach(async () => {
    ({ AgentFullPage } = await import(
      '@genfeedai/agent/components/AgentFullPage'
    ));

    storeState.setActiveRun.mockReset();
    storeState.setActiveThread.mockReset();
    storeState.setCreditsRemaining.mockReset();
    storeState.setDraftPlanModeEnabled.mockReset();
    storeState.setError.mockReset();
    storeState.setLatestProposedPlan.mockReset();
    storeState.setMessagesPage.mockReset();
    storeState.setModelCosts.mockReset();
    storeState.setThreadPrompt.mockReset();
    storeState.setWorkEvents.mockReset();
    storeState.upsertThread.mockReset();
    storeState.resetStreamState.mockReset();
    storeState.resetActiveConversationState.mockReset();
    storeState.clearThreadAttention.mockReset();
    storeState.activeRunId = null;
    storeState.activeThreadId = null;
    storeState.stream = { isStreaming: false };
    storeState.isConversationCacheFresh.mockReset();
    storeState.isConversationCacheFresh.mockReturnValue(false);
    storeState.messages = [];
    storeState.pageContext = null;
    storeState.threads = [];
    storeState.setPendingInputRequest.mockReset();
    storeState.setRunStartedAt.mockReset();
    setupStatusState.showSetupPanel = false;
    conversationHydrationFlights.clear();
  });

  afterEach(() => {
    conversationHydrationFlights.clear();
  });

  it('loads thread messages under React Strict Mode', async () => {
    const messages = [
      {
        content: 'Earlier user prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages, nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: 'Loaded thread',
          },
          signal,
        ),
      ),
    });

    render(
      <StrictMode>
        <AgentFullPage apiService={apiService as never} threadId="thread-1" />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalledWith({
        hasMore: false,
        messages,
        nextCursor: null,
      });
    });

    expect(apiService.getThread).toHaveBeenCalledTimes(2);
    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(2);
    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(2);
    expect(storeState.setError).toHaveBeenCalledWith(null);
  });

  it('restores a durable terminal error during cold thread hydration', async () => {
    const apiService = createApiService({
      getMessagesPage: vi
        .fn()
        .mockResolvedValue({ hasMore: false, messages: [], nextCursor: null }),
      getThread: vi.fn().mockResolvedValue({
        createdAt: '2026-08-28T17:00:00.000Z',
        id: 'thread-failed',
        status: AgentThreadStatus.ACTIVE,
        title: 'Failed thread',
        updatedAt: '2026-08-28T17:01:00.000Z',
      }),
      getThreadSnapshot: vi.fn().mockResolvedValue({
        activeRun: { runId: 'run-failed', status: 'failed' },
        lastAssistantMessage: null,
        lastSequence: 1,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: 'thread-failed',
        threadStatus: AgentThreadStatus.ACTIVE,
        timeline: [
          {
            createdAt: '2026-08-28T17:01:00.000Z',
            detail: 'Provider authentication failed',
            id: 'failure-1',
            kind: 'error',
            label: 'Agent error',
            runId: 'run-failed',
            sequence: 1,
            status: 'failed',
          },
        ],
        title: 'Failed thread',
      }),
    });

    render(
      <AgentFullPage
        apiService={apiService as never}
        threadId="thread-failed"
      />,
    );

    await waitFor(() => {
      expect(storeState.setError).toHaveBeenCalledWith(
        'Provider authentication failed',
      );
    });
  });

  it('skips the thread and snapshot requests when the conversation cache is fresh (#2790)', async () => {
    storeState.isConversationCacheFresh.mockReturnValue(true);
    const messages = [
      {
        content: 'Cached prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages, nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn(),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalledWith({
        hasMore: false,
        messages,
        nextCursor: null,
      });
    });

    expect(apiService.getThread).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
    expect(storeState.setError).not.toHaveBeenCalled();
  });

  it('hydrates the planning task and plan mode from the listed thread when the cache is fresh (#2799)', async () => {
    storeState.isConversationCacheFresh.mockReturnValue(true);
    storeState.threads = [
      {
        id: 'thread-1',
        planModeEnabled: true,
        source: 'workspace-planning:task-42',
      },
    ];
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages: [], nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn(),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    // The skipped `getThread` handler is the only writer of both values, so on
    // a warm open they have to come from the list row instead.
    await waitFor(() => {
      expect(screen.getByText('planning-task-task-42')).toBeDefined();
    });
    expect(storeState.setDraftPlanModeEnabled).toHaveBeenCalledWith(true);
    expect(apiService.getThread).not.toHaveBeenCalled();
  });

  it('still reports a load failure for a messages-only rejection when the cache is fresh (#2790)', async () => {
    storeState.isConversationCacheFresh.mockReturnValue(true);
    const apiService = createApiService({
      getMessagesPage: vi.fn().mockRejectedValue(new Error('Messages down')),
      getThread: vi.fn(),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(storeState.setError).toHaveBeenCalledWith(
        'Failed to load this thread. Refresh and try again.',
      );
    });

    expect(apiService.getThread).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
  });

  it('adopts an in-flight prefetch instead of stacking a second messages set (#2790)', async () => {
    const messages = [
      {
        content: 'Prefetched prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];
    let resolvePrefetch:
      | ((result: {
          page: {
            hasMore: boolean;
            messages: typeof messages;
            nextCursor: string | null;
          };
          snapshot: {
            activeRun: null;
            lastAssistantMessage: null;
            lastSequence: number;
            latestProposedPlan: null;
            latestUiBlocks: null;
            memorySummaryRefs: never[];
            pendingApprovals: never[];
            pendingInputRequests: never[];
            profileSnapshot: null;
            sessionBinding: null;
            source: string;
            threadId: string;
            threadStatus: typeof AgentThreadStatus.ACTIVE;
            timeline: never[];
            title: string;
          };
        }) => void)
      | undefined;
    conversationHydrationFlights.begin(
      'thread-1',
      () =>
        new Promise((resolve) => {
          resolvePrefetch = resolve;
        }),
    );
    const apiService = createApiService({
      getMessagesPage: vi.fn(),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();

    resolvePrefetch?.({
      page: { hasMore: false, messages, nextCursor: null },
      snapshot: {
        activeRun: null,
        lastAssistantMessage: null,
        lastSequence: 0,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: 'thread-1',
        threadStatus: AgentThreadStatus.ACTIVE,
        timeline: [],
        title: 'Prefetched thread',
      },
    });

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalledWith({
        hasMore: false,
        messages,
        nextCursor: null,
      });
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(apiService.getThread).toHaveBeenCalledTimes(1);
  });

  it('debounces a rapid bounce so the intermediate thread never starts a request set (#2790)', async () => {
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            {
              hasMore: false,
              messages: [
                {
                  content: threadId,
                  createdAt: '2026-03-10T10:00:00.000Z',
                  id: `msg-${threadId}`,
                  role: 'user',
                  threadId,
                },
              ],
              nextCursor: null,
            },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: threadId,
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: threadId,
          },
          signal,
        ),
      ),
    });

    const rapidSwitchAt = Date.now();
    const view = render(
      <AgentFullPage apiService={apiService as never} threadId="thread-a" />,
    );
    await waitFor(() => {
      expect(apiService.getMessagesPage).toHaveBeenCalledWith(
        'thread-a',
        expect.anything(),
        expect.anything(),
      );
    });

    // Anchor the bounce to the first render. Wall-clock time spent waiting for
    // the initial assertion must not turn this rapid-switch fixture into a
    // slow switch on a loaded CI runner.
    vi.useFakeTimers({ now: rapidSwitchAt });
    try {
      view.rerender(
        <AgentFullPage apiService={apiService as never} threadId="thread-b" />,
      );
      view.rerender(
        <AgentFullPage apiService={apiService as never} threadId="thread-c" />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(THREAD_SWITCH_DEBOUNCE_MS);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalled();
    });

    const requestedThreadIds = (
      apiService.getMessagesPage as ReturnType<typeof vi.fn>
    ).mock.calls.map((call) => call[0]);
    expect(requestedThreadIds).toContain('thread-a');
    expect(requestedThreadIds).toContain('thread-c');
    expect(requestedThreadIds).not.toContain('thread-b');
    expect(THREAD_SWITCH_DEBOUNCE_MS).toBeGreaterThan(0);
  });

  it('fires all three requests when the conversation cache is not fresh (#2790 regression)', async () => {
    storeState.isConversationCacheFresh.mockReturnValue(false);
    const messages = [
      {
        content: 'Fresh prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages, nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: 'Loaded thread',
          },
          signal,
        ),
      ),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalledWith({
        hasMore: false,
        messages,
        nextCursor: null,
      });
    });

    expect(apiService.getThread).toHaveBeenCalledTimes(1);
    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(1);
    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
    expect(storeState.setError).toHaveBeenCalledWith(null);
  });

  it('never fetches thread data for a stringified "undefined" thread id', async () => {
    const apiService = createApiService();

    render(
      <AgentFullPage apiService={apiService as never} threadId="undefined" />,
    );

    await waitFor(() => {
      expect(storeState.setActiveThread).toHaveBeenCalledWith(null);
    });

    expect(apiService.getThread).not.toHaveBeenCalled();
    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
  });

  it('surfaces a generic load error when bootstrap fails', async () => {
    const apiService = createApiService({
      getMessagesPage: vi.fn(),
      getThread: vi.fn().mockRejectedValue(new Error('Network down')),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(storeState.setError).toHaveBeenCalledWith(
        'Failed to load this thread. Refresh and try again.',
      );
    });
  });

  it('passes a loading state to the chat container while bootstrapping a thread', async () => {
    const messages = [
      {
        content: 'Earlier user prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];
    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages, nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: 'Loaded thread',
          },
          signal,
        ),
      ),
    });

    const { getByText, queryByText } = render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    expect(
      getByText('agent-chat-container loading-thread'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(storeState.setMessagesPage).toHaveBeenCalledWith({
        hasMore: false,
        messages,
        nextCursor: null,
      });
    });

    await waitFor(() => {
      expect(queryByText('agent-chat-container loading-thread')).toBeNull();
    });
  });

  it('hides outputs chrome when the thread has no outputs', () => {
    render(<AgentFullPage apiService={createApiService() as never} />);

    expect(screen.getAllByText('agent-sidebar-content')).toHaveLength(2);
    expect(screen.queryByText('Outputs')).not.toBeInTheDocument();
    expect(screen.queryByText('agent-outputs-panel')).not.toBeInTheDocument();
    expect(screen.getByText('wide-layout')).toBeInTheDocument();
  });

  it('can suppress thread navigation chrome in protected-shell mode', () => {
    render(
      <AgentFullPage
        apiService={createApiService() as never}
        showThreadSidebar={false}
      />,
    );

    expect(screen.queryByText('agent-sidebar-content')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Threads' }),
    ).not.toBeInTheDocument();
  });

  it('renders the outputs rail chrome when the thread has outputs', () => {
    storeState.messages = [
      {
        content: 'Generated something useful',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-output',
        metadata: {
          uiActions: [
            {
              id: 'action-output',
              images: ['https://cdn.test/output.png'],
              title: 'Generated outputs',
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(<AgentFullPage apiService={createApiService() as never} />);

    // T3 density: no inline right rail on product routes — the outputs panel
    // lives in the mobile drawer only, and the conversation stays wide.
    expect(screen.getAllByText('agent-outputs-panel')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Outputs' })).toBeInTheDocument();
    expect(screen.getByText('wide-layout')).toBeInTheDocument();
  });

  it('projects outputs only while the conversation owns the shell inspector', async () => {
    storeState.messages = [
      {
        content: 'Generated something useful',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-output',
        metadata: {
          uiActions: [
            {
              id: 'action-output',
              images: ['https://cdn.test/output.png'],
              title: 'Generated outputs',
              type: 'content_preview_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    const onPanelPresenceChange = vi.fn();

    const view = render(
      <ConversationInspectorShellProvider
        isActive
        onPanelPresenceChange={onPanelPresenceChange}
        portalTarget={portalTarget}
      >
        <AgentFullPage apiService={createApiService() as never} />
      </ConversationInspectorShellProvider>,
    );

    await waitFor(() => {
      expect(onPanelPresenceChange).toHaveBeenLastCalledWith(true);
    });
    expect(portalTarget).toHaveTextContent('agent-outputs-panel');

    view.rerender(
      <ConversationInspectorShellProvider
        isActive={false}
        onPanelPresenceChange={onPanelPresenceChange}
        portalTarget={portalTarget}
      >
        <AgentFullPage apiService={createApiService() as never} />
      </ConversationInspectorShellProvider>,
    );

    await waitFor(() => {
      expect(onPanelPresenceChange).toHaveBeenLastCalledWith(false);
    });
    expect(portalTarget).toBeEmptyDOMElement();
    portalTarget.remove();
  });

  it('projects thread context into the inspector when there are no outputs and no setup panel', async () => {
    // The rail used to fall through to a placeholder sentence in exactly this
    // state — a finished (or brandless) setup with a conversation that has not
    // produced outputs yet. Context is the floor, so the rail is never empty.
    setupStatusState.showSetupPanel = false;
    storeState.messages = [];
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);
    const onPanelPresenceChange = vi.fn();

    render(
      <ConversationInspectorShellProvider
        isActive
        onPanelPresenceChange={onPanelPresenceChange}
        portalTarget={portalTarget}
      >
        <AgentFullPage apiService={createApiService() as never} />
      </ConversationInspectorShellProvider>,
    );

    await waitFor(() => {
      expect(onPanelPresenceChange).toHaveBeenLastCalledWith(true);
    });
    expect(portalTarget).toHaveTextContent('agent-thread-context-panel');
    portalTarget.remove();
  });

  it('prefers latest assistant completion recos over static page-context actions', () => {
    storeState.pageContext = {
      placeholder: 'Ask about this page...',
      route: '/agent',
      suggestedActions: [
        {
          id: 'page-context-action',
          label: 'Static action',
          prompt: 'Use the default page suggestion',
        },
      ],
    };
    storeState.messages = [
      {
        content: 'Image generated and ready.',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-runtime-recos',
        metadata: {
          suggestedActions: [
            {
              id: 'runtime-action',
              label: 'Make variations',
              prompt: 'Make three stronger variations of this result',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(<AgentFullPage apiService={createApiService() as never} />);

    expect(screen.getByText('Make variations')).toBeInTheDocument();
    expect(screen.queryByText('Static action')).not.toBeInTheDocument();
  });

  it('preserves visible messages while refreshing the already-active thread', async () => {
    storeState.activeThreadId = 'thread-1';
    storeState.messages = [
      {
        content: 'Existing visible message',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-keep',
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            {
              hasMore: false,
              messages: storeState.messages,
              nextCursor: null,
            },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: 'Loaded thread',
          },
          signal,
        ),
      ),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    expect(storeState.setMessagesPage).not.toHaveBeenCalled();
    expect(storeState.resetStreamState).not.toHaveBeenCalled();
  });

  it('does not reload the thread when an optimistic message is appended locally', async () => {
    const persistedMessages = [
      {
        content: 'Earlier user prompt',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];

    storeState.activeThreadId = 'thread-1';
    storeState.messages = persistedMessages;

    const apiService = createApiService({
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages: persistedMessages, nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Loaded thread',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            activeRun: null,
            lastAssistantMessage: null,
            lastSequence: 0,
            latestProposedPlan: null,
            latestUiBlocks: null,
            memorySummaryRefs: [],
            pendingApprovals: [],
            pendingInputRequests: [],
            profileSnapshot: null,
            sessionBinding: null,
            source: 'agent',
            threadId,
            threadStatus: AgentThreadStatus.ACTIVE,
            timeline: [],
            title: 'Loaded thread',
          },
          signal,
        ),
      ),
    });

    const { rerender } = render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(apiService.getThread).toHaveBeenCalledTimes(1);
    });

    storeState.messages = [
      ...persistedMessages,
      {
        content: 'try again',
        createdAt: '2026-03-10T10:01:00.000Z',
        id: 'msg-optimistic',
        role: 'user',
        threadId: 'thread-1',
      },
    ];

    rerender(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(apiService.getThread).toHaveBeenCalledTimes(1);
    });
    expect(apiService.getMessagesPage).toHaveBeenCalledTimes(1);
    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('never rehydrates messages or snapshot over a live local run when the URL catches up to the streaming thread', async () => {
    // First prompt on /agent/new: sendMessage created thread-1, the store is
    // streaming it, and only then does the route land on /agent/thread-1.
    storeState.activeThreadId = 'thread-1';
    storeState.activeRunId = 'run-1';
    storeState.stream = { isStreaming: true };
    storeState.messages = [
      {
        content: 'Make me a hero image',
        createdAt: '2026-03-10T10:00:00.000Z',
        id: 'msg-user-1',
        role: 'user',
        threadId: 'thread-1',
      },
    ];

    const apiService = createApiService({
      // A page fetched now predates the assistant turn: it must never land.
      getMessagesPage: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(
            { hasMore: false, messages: [], nextCursor: null },
            signal,
          ),
      ),
      getThread: vi.fn((threadId: string, signal?: AbortSignal) =>
        createAbortAwareValue(
          {
            createdAt: '2026-03-10T10:00:00.000Z',
            id: threadId,
            status: AgentThreadStatus.ACTIVE,
            title: 'Make me a hero image',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
          signal,
        ),
      ),
      getThreadSnapshot: vi.fn(),
    });

    render(
      <AgentFullPage apiService={apiService as never} threadId="thread-1" />,
    );

    await waitFor(() => {
      expect(apiService.getThread).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(storeState.setThreadPrompt).toHaveBeenCalledWith(
        'thread-1',
        undefined,
      );
    });

    expect(apiService.getMessagesPage).not.toHaveBeenCalled();
    expect(apiService.getThreadSnapshot).not.toHaveBeenCalled();
    expect(storeState.setMessagesPage).not.toHaveBeenCalled();
    expect(storeState.resetStreamState).not.toHaveBeenCalled();
    expect(storeState.setWorkEvents).not.toHaveBeenCalled();
    expect(storeState.setActiveRun).not.toHaveBeenCalled();
  });

  it('uses chat-first empty state copy outside onboarding', async () => {
    const apiService = createApiService();

    render(<AgentFullPage apiService={apiService as never} />);

    expect(screen.getByText('Start a chat')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Plan content, review drafts, or decide what to do next.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask for help with content, review, or planning...'),
    ).toBeInTheDocument();
    expect(screen.getByText('surface-fixed')).toBeInTheDocument();
  });

  it('uses a paste-or-type placeholder on onboarding', () => {
    render(
      <AgentFullPage apiService={createApiService() as never} onboardingMode />,
    );

    expect(
      screen.getByText('Paste a site or handle, or type what you make...'),
    ).toBeInTheDocument();
  });

  it('does not clear draft conversation state again while waiting to navigate away from /agent/new', async () => {
    const apiService = createApiService();

    const { rerender } = render(
      <AgentFullPage apiService={apiService as never} />,
    );

    await waitFor(() => {
      expect(storeState.resetActiveConversationState).toHaveBeenCalledTimes(1);
    });

    storeState.resetActiveConversationState.mockClear();
    storeState.setActiveThread.mockClear();
    storeState.setDraftPlanModeEnabled.mockClear();
    storeState.setLatestProposedPlan.mockClear();
    storeState.activeThreadId = 'thread-1';
    storeState.messages = [
      {
        content: 'Keep this pending plan state',
        createdAt: '2026-03-26T10:00:00.000Z',
        id: 'msg-pending-navigation',
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    rerender(<AgentFullPage apiService={apiService as never} />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(storeState.resetActiveConversationState).not.toHaveBeenCalled();
    expect(storeState.setActiveThread).not.toHaveBeenCalled();
    expect(storeState.setDraftPlanModeEnabled).not.toHaveBeenCalled();
    expect(storeState.setLatestProposedPlan).not.toHaveBeenCalled();
  });

  it('keeps product agent routes single-column even when setup is incomplete', () => {
    setupStatusState.showSetupPanel = true;
    storeState.messages = [];

    render(<AgentFullPage apiService={createApiService() as never} />);

    // T3 density: non-onboarding standalone does not paint a dual-column rail.
    // The mobile drawer is the only place the setup panel mounts; the
    // conversation column stays wide.
    expect(screen.getAllByText('agent-setup-panel')).toHaveLength(1);
    expect(screen.getByText('wide-layout')).toBeInTheDocument();
  });

  it('does not render the setup panel once setup is complete', () => {
    setupStatusState.showSetupPanel = false;
    storeState.messages = [];

    render(<AgentFullPage apiService={createApiService() as never} />);

    expect(screen.queryByText('agent-setup-panel')).not.toBeInTheDocument();
    expect(screen.getByText('wide-layout')).toBeInTheDocument();
  });

  it('keeps onboarding dual-column setup chrome when setup is incomplete', () => {
    setupStatusState.showSetupPanel = true;
    storeState.messages = [];

    render(
      <AgentFullPage apiService={createApiService() as never} onboardingMode />,
    );

    expect(screen.getAllByText('agent-setup-panel').length).toBeGreaterThan(0);
    expect(screen.queryByText('agent-outputs-panel')).not.toBeInTheDocument();
    expect(screen.getByText('standard-layout')).toBeInTheDocument();
  });

  it('prioritizes thread outputs over the setup panel in onboarding when both apply', () => {
    setupStatusState.showSetupPanel = true;
    storeState.messages = [
      {
        content: 'Generated a video',
        createdAt: '2026-03-26T10:00:00.000Z',
        id: 'msg-output',
        metadata: { mediaUrl: 'https://cdn/output.mp4' } as never,
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(
      <AgentFullPage apiService={createApiService() as never} onboardingMode />,
    );

    expect(screen.getAllByText('agent-outputs-panel').length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText('agent-setup-panel')).not.toBeInTheDocument();
  });
});
