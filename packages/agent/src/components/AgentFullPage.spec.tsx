import { AgentThreadStatus } from '@genfeedai/enums';
import { render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  activeThreadId: string | null;
  clearComposerSeed: ReturnType<typeof vi.fn>;
  creditsRemaining: number | null;
  composerSeed: null;
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
  resetActiveConversationState: ReturnType<typeof vi.fn>;
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveThread: ReturnType<typeof vi.fn>;
  setCreditsRemaining: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
  setModelCosts: ReturnType<typeof vi.fn>;
  setDraftPlanModeEnabled: ReturnType<typeof vi.fn>;
  setLatestProposedPlan: ReturnType<typeof vi.fn>;
  setPendingInputRequest: ReturnType<typeof vi.fn>;
  setRunStartedAt: ReturnType<typeof vi.fn>;
  setThreadPrompt: ReturnType<typeof vi.fn>;
  setWorkEvents: ReturnType<typeof vi.fn>;
  seedComposer: ReturnType<typeof vi.fn>;
  upsertThread: ReturnType<typeof vi.fn>;
}

const storeState: StoreState = {
  activeThreadId: null,
  clearComposerSeed: vi.fn(),
  clearThreadAttention: vi.fn(),
  composerSeed: null,
  creditsRemaining: null,
  messages: [],
  modelCosts: {},
  onboardingSignupGiftCredits: 0,
  onboardingSteps: [],
  onboardingTotalJourneyCredits: 100,
  onboardingTotalVisibleCredits: 100,
  pageContext: null,
  resetActiveConversationState: vi.fn(),
  resetStreamState: vi.fn(),
  seedComposer: vi.fn(),
  setActiveRun: vi.fn(),
  setActiveThread: vi.fn(),
  setCreditsRemaining: vi.fn(),
  setDraftPlanModeEnabled: vi.fn(),
  setError: vi.fn(),
  setLatestProposedPlan: vi.fn(),
  setMessages: vi.fn(),
  setModelCosts: vi.fn(),
  setPendingInputRequest: vi.fn(),
  setRunStartedAt: vi.fn(),
  setThreadPrompt: vi.fn(),
  setWorkEvents: vi.fn(),
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

let AgentFullPage: typeof import('@genfeedai/agent/components/AgentFullPage').AgentFullPage;

const EFFECT_METHOD_MAP = {
  getCreditsInfo: 'getCreditsInfoEffect',
  getMessages: 'getMessagesEffect',
  getThread: 'getThreadEffect',
  getThreadSnapshot: 'getThreadSnapshotEffect',
} as const;

function withAgentApiEffects<T extends Record<string, unknown>>(
  apiService: T,
): T {
  for (const [method, effectMethod] of Object.entries(EFFECT_METHOD_MAP)) {
    const handler = apiService[method as keyof T];

    if (typeof handler !== 'function' || effectMethod in apiService) {
      continue;
    }

    Object.assign(apiService, {
      [effectMethod]: vi.fn((...args: unknown[]) =>
        Effect.promise(() =>
          Promise.resolve(
            (handler as (...effectArgs: unknown[]) => unknown)(...args),
          ),
        ),
      ),
    });
  }

  return apiService;
}

function createApiService(overrides: Record<string, unknown> = {}) {
  return withAgentApiEffects({
    getCreditsInfo: vi.fn().mockResolvedValue({ balance: 50, modelCosts: {} }),
    getMessages: vi.fn(),
    getThread: vi.fn(),
    getThreadSnapshot: vi.fn(),
    ...overrides,
  });
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
    storeState.setMessages.mockReset();
    storeState.setModelCosts.mockReset();
    storeState.setThreadPrompt.mockReset();
    storeState.setWorkEvents.mockReset();
    storeState.upsertThread.mockReset();
    storeState.resetStreamState.mockReset();
    storeState.resetActiveConversationState.mockReset();
    storeState.clearThreadAttention.mockReset();
    storeState.activeThreadId = null;
    storeState.messages = [];
    storeState.pageContext = null;
    storeState.setPendingInputRequest.mockReset();
    storeState.setRunStartedAt.mockReset();
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
      getMessages: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(messages, signal),
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
      expect(storeState.setMessages).toHaveBeenCalledWith(messages);
    });

    expect(apiService.getThread).toHaveBeenCalledTimes(2);
    expect(apiService.getMessages).toHaveBeenCalledTimes(2);
    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(2);
    expect(storeState.setError).not.toHaveBeenCalled();
  });

  it('surfaces a generic load error when bootstrap fails', async () => {
    const apiService = createApiService({
      getMessages: vi.fn(),
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
      getMessages: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(messages, signal),
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
      expect(storeState.setMessages).toHaveBeenCalledWith(messages);
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

    expect(screen.getAllByText('agent-outputs-panel')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Outputs' })).toBeInTheDocument();
    expect(screen.getByText('standard-layout')).toBeInTheDocument();
  });

  it('prefers latest assistant completion recos over static page-context actions', () => {
    storeState.pageContext = {
      placeholder: 'Ask about this page...',
      route: '/chat',
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
      getMessages: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(storeState.messages, signal),
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

    expect(storeState.setMessages).not.toHaveBeenCalledWith([]);
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
      getMessages: vi.fn(
        (_threadId: string, _params: unknown, signal?: AbortSignal) =>
          createAbortAwareValue(persistedMessages, signal),
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
    expect(apiService.getMessages).toHaveBeenCalledTimes(1);
    expect(apiService.getThreadSnapshot).toHaveBeenCalledTimes(1);
  });

  it('uses chat-first empty state copy outside onboarding', async () => {
    const apiService = createApiService();

    render(<AgentFullPage apiService={apiService as never} />);

    expect(screen.getByText('Start a chat')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ask for help planning content, reviewing drafts, or understanding what to do next.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask for help with content, review, or planning...'),
    ).toBeInTheDocument();
    expect(screen.getByText('surface-fixed')).toBeInTheDocument();
  });

  it('does not clear draft conversation state again while waiting to navigate away from /chat/new', async () => {
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
});
