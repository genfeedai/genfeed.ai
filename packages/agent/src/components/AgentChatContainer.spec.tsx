import {
  type AgentChatMessage as AgentChatMessageType,
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNonStreaming = vi.fn();
const sendStreaming = vi.fn();
let isStreamingHookActive = false;
const scrollIntoViewMock = vi.fn();

vi.mock('@contexts/user/user-context/user-context', () => ({
  useOptionalUser: () => null,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => null,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
  }),
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => ({
    getToken: vi.fn(),
  }),
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: 'connected',
    getSocketManager: () => ({ isConnected: () => false }),
    isReady: false,
    subscribe: () => () => undefined,
  }),
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {},
}));

vi.mock('@services/organization/users.service', () => ({
  UsersService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    isDisabled?: boolean;
    onClick?: () => void | Promise<void>;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        className={props.className}
        disabled={props.isDisabled}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

vi.mock('@ui/feedback/alert/Alert', () => ({
  default: function MockAlert(props: { children?: ReactNode }) {
    return <div>{props.children}</div>;
  },
}));

vi.mock('@ui/layout/prompt-bar-container/PromptBarContainer', () => ({
  default: function MockPromptBarContainer(props: {
    children?: ReactNode;
    layoutMode?: string;
    maxWidth?: string;
    showTopFade?: boolean;
    topContent?: ReactNode;
  }) {
    return (
      <div
        data-layout-mode={props.layoutMode}
        data-max-width={props.maxWidth}
        data-show-top-fade={props.showTopFade ? 'true' : 'false'}
      >
        {props.topContent}
        {props.children}
      </div>
    );
  },
}));

vi.mock('@ui/prompt-bars/components/suggestions/PromptBarSuggestions', () => ({
  default: function MockPromptBarSuggestions(props: {
    suggestions?: Array<{ id?: string; label: string; prompt: string }>;
    onSuggestionSelect?: (suggestion: {
      id?: string;
      label: string;
      prompt: string;
    }) => void;
  }) {
    return (
      <div>
        {props.suggestions?.map((suggestion) => (
          <button
            key={suggestion.id ?? suggestion.label}
            type="button"
            onClick={() => props.onSuggestionSelect?.(suggestion)}
          >
            {suggestion.label}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('@genfeedai/agent/hooks/use-agent-chat', () => ({
  useAgentChat: () => ({
    sendMessage: sendNonStreaming,
  }),
}));

vi.mock('@genfeedai/agent/hooks/use-agent-chat-stream', () => ({
  useAgentChatStream: () => ({
    isStreaming: isStreamingHookActive,
    sendMessage: sendStreaming,
  }),
}));

vi.mock('../utils/extract-thread-assets', () => ({
  extractThreadAssets: () => [],
}));

vi.mock('@genfeedai/agent/components/AgentChatInput', () => ({
  AgentChatInput: function MockAgentChatInput(props: { showStop?: boolean }) {
    return <div>chat-input{props.showStop ? ' stop-visible' : ''}</div>;
  },
}));

vi.mock('@genfeedai/agent/components/AgentChatMessage', () => ({
  AgentChatMessage: function MockAgentChatMessage(props: {
    message?: {
      role?: string;
      metadata?: {
        uiActions?: Array<{
          ctas?: Array<{
            action?: string;
            href?: string;
            label: string;
            payload?: Record<string, unknown>;
          }>;
        }>;
      };
    };
    onRetry?: (message: AgentChatMessageType) => void | Promise<void>;
    onUiAction?: (action: string, payload?: Record<string, unknown>) => void;
  }) {
    const ctas = props.message?.metadata?.uiActions?.flatMap(
      (action) => action.ctas ?? [],
    );

    return (
      <div>
        message
        {props.message?.role === 'assistant' ? (
          <button
            type="button"
            onClick={() => {
              if (props.message) {
                void props.onRetry?.(props.message as AgentChatMessageType);
              }
            }}
          >
            Retry message
          </button>
        ) : null}
        {ctas?.map((cta) =>
          cta.href ? (
            <a key={cta.label} href={cta.href}>
              {cta.label}
            </a>
          ) : cta.action ? (
            <button
              key={cta.label}
              type="button"
              onClick={() => props.onUiAction?.(cta.action!, cta.payload)}
            >
              {cta.label}
            </button>
          ) : null,
        )}
      </div>
    );
  },
  UiActionRenderer: function MockUiActionRenderer() {
    return <div>ui-action</div>;
  },
}));

vi.mock('@genfeedai/agent/components/TimelineWorkGroup', () => ({
  TimelineWorkGroup: function MockTimelineWorkGroup() {
    return <div>work-group</div>;
  },
}));

vi.mock('@genfeedai/agent/components/TimelineStreamingRow', () => ({
  TimelineStreamingRow: function MockTimelineStreamingRow(props: {
    entry?: {
      runDurationLabel?: string | null;
      streamState?: { streamingContent?: string };
    };
  }) {
    const content = props.entry?.streamState?.streamingContent;
    return (
      <div>
        streaming-row
        {content
          ? ` streaming ${props.entry?.runDurationLabel ?? 'no-duration'}`
          : ''}
      </div>
    );
  },
}));

vi.mock('./AgentToolCallDisplay', () => ({
  AgentToolCallDisplay: function MockAgentToolCallDisplay() {
    return <div>tool-call</div>;
  },
  TOOL_LABELS: {},
}));

vi.mock('@genfeedai/agent/components/AgentInputRequestOverlay', () => ({
  AgentInputRequestOverlay: function MockAgentInputRequestOverlay(props: {
    onSubmit: (answer: string) => Promise<void>;
  }) {
    return (
      <button
        type="button"
        onClick={() => {
          void props.onSubmit('Use the hybrid prompt bar');
        }}
      >
        Submit requested input
      </button>
    );
  },
}));

type StoreState = {
  activeThreadId: string | null;
  activeRunId: string | null;
  activeRunStatus:
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'failed'
    | 'completed'
    | 'cancelled';
  addMessage: ReturnType<typeof vi.fn>;
  addWorkEvent: ReturnType<typeof vi.fn>;
  clearPendingInputRequest: ReturnType<typeof vi.fn>;
  draftPlanModeEnabled: boolean;
  latestProposedPlan: null | {
    id: string;
    status?: string;
    content?: string;
    createdAt: string;
    updatedAt: string;
  };
  threads: Array<{ id: string; source?: string; title?: string }>;
  error: string | null;
  isGenerating: boolean;
  messages: AgentChatMessageType[];
  pendingInputRequest: {
    allowFreeText: boolean;
    threadId: string;
    inputRequestId: string;
    options: [];
    prompt: string;
    runId: string;
    title: string;
  } | null;
  runStartedAt: string | null;
  setActiveThread: ReturnType<typeof vi.fn>;
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveRunStatus: ReturnType<typeof vi.fn>;
  setCreditsRemaining: ReturnType<typeof vi.fn>;
  setDraftPlanModeEnabled: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setLatestProposedPlan: ReturnType<typeof vi.fn>;
  stream: {
    activeToolCalls: [];
    pendingUiActions: [];
    streamingContent: string;
    streamingReasoning: string;
  };
  upsertThread: ReturnType<typeof vi.fn>;
  updateThread: ReturnType<typeof vi.fn>;
  workEvents: [];
};

const storeState: StoreState = {
  activeRunId: 'run-1',
  activeRunStatus: 'running',
  activeThreadId: 'thread-1',
  addMessage: vi.fn(),
  addWorkEvent: vi.fn(),
  clearPendingInputRequest: vi.fn(),
  draftPlanModeEnabled: false,
  error: null,
  isGenerating: false,
  latestProposedPlan: null,
  messages: [
    {
      content: 'Need your choice',
      createdAt: '2026-03-11T00:00:00.000Z',
      id: 'm-1',
      role: 'assistant',
      threadId: 'thread-1',
    },
  ],
  pendingInputRequest: {
    allowFreeText: true,
    inputRequestId: 'input-1',
    options: [],
    prompt: 'Choose the prompt bar mode',
    runId: 'run-1',
    threadId: 'thread-1',
    title: 'Prompt bar mode',
  },
  runStartedAt: null,
  setActiveRun: vi.fn(),
  setActiveRunStatus: vi.fn(),
  setActiveThread: vi.fn(),
  setCreditsRemaining: vi.fn(),
  setDraftPlanModeEnabled: vi.fn((enabled: boolean) => {
    storeState.draftPlanModeEnabled = enabled;
  }),
  setError: vi.fn(),
  setLatestProposedPlan: vi.fn((plan) => {
    storeState.latestProposedPlan = plan;
  }),
  stream: {
    activeToolCalls: [],
    pendingUiActions: [],
    streamingContent: '',
    streamingReasoning: '',
  },
  threads: [],
  updateThread: vi.fn(),
  upsertThread: vi.fn(),
  workEvents: [],
};

const EFFECT_METHOD_MAP = {
  cancelRun: 'cancelRunEffect',
  getActiveRuns: 'getActiveRunsEffect',
  respondToInputRequest: 'respondToInputRequestEffect',
  respondToUiAction: 'respondToUiActionEffect',
  updateThread: 'updateThreadEffect',
  uploadAttachment: 'uploadAttachmentEffect',
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
    cancelRun: vi.fn(),
    getActiveRuns: vi.fn().mockResolvedValue([]),
    respondToInputRequest: vi.fn(),
    respondToUiAction: vi.fn(),
    updateThread: vi.fn(),
    uploadAttachment: vi.fn(),
    ...overrides,
  });
}

function buildAssistantMessage(
  overrides: Partial<AgentChatMessageType> = {},
): AgentChatMessageType {
  return {
    content: 'Need your choice',
    createdAt: '2026-03-11T00:00:00.000Z',
    id: 'm-1',
    role: 'assistant',
    threadId: 'thread-1',
    ...overrides,
  };
}

vi.mock('@genfeedai/agent/stores/agent-chat.store', () => ({
  useAgentChatStore: (selector: (state: StoreState) => unknown) =>
    selector(storeState),
}));

let AgentChatContainer: typeof import('@genfeedai/agent/components/AgentChatContainer').AgentChatContainer;

describe('AgentChatContainer', () => {
  beforeAll(async () => {
    const domElement = globalThis.window?.HTMLElement;
    if (domElement) {
      Object.defineProperty(domElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoViewMock,
      });
    }

    ({ AgentChatContainer } = await import(
      '@genfeedai/agent/components/AgentChatContainer'
    ));
  });

  beforeEach(() => {
    isStreamingHookActive = false;
    scrollIntoViewMock.mockReset();
    sendNonStreaming.mockReset();
    sendStreaming.mockReset();
    storeState.addMessage.mockReset();
    storeState.addWorkEvent.mockReset();
    storeState.clearPendingInputRequest.mockReset();
    storeState.setActiveThread.mockReset();
    storeState.setActiveRun.mockReset();
    storeState.setActiveRunStatus.mockReset();
    storeState.setCreditsRemaining.mockReset();
    storeState.setDraftPlanModeEnabled.mockReset();
    storeState.setError.mockReset();
    storeState.setLatestProposedPlan.mockReset();
    storeState.upsertThread.mockReset();
    storeState.updateThread.mockReset();
    storeState.draftPlanModeEnabled = false;
    storeState.latestProposedPlan = null;
    storeState.pendingInputRequest = {
      allowFreeText: true,
      inputRequestId: 'input-1',
      options: [],
      prompt: 'Choose the prompt bar mode',
      runId: 'run-1',
      threadId: 'thread-1',
      title: 'Prompt bar mode',
    };
    storeState.messages = [buildAssistantMessage()];
    storeState.runStartedAt = null;
    storeState.stream.streamingContent = '';
    storeState.threads = [];
  });

  it('submits pending input through the response endpoint instead of chat send', async () => {
    const apiService = createApiService({
      respondToInputRequest: vi.fn().mockResolvedValue({
        answer: 'Use the hybrid prompt bar',
        requestId: 'input-1',
        resolvedAt: '2026-03-09T10:00:00.000Z',
        status: 'resolved',
        threadId: 'thread-1',
      }),
      respondToUiAction: vi.fn(),
    });

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    fireEvent.click(screen.getByText('Submit requested input'));

    await waitFor(() => {
      expect(apiService.respondToInputRequest).toHaveBeenCalledWith(
        'thread-1',
        'input-1',
        'Use the hybrid prompt bar',
      );
    });

    expect(sendNonStreaming).not.toHaveBeenCalled();
    expect(sendStreaming).not.toHaveBeenCalled();
    expect(storeState.addWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AgentWorkEventType.INPUT_SUBMITTED,
        inputRequestId: 'input-1',
        status: AgentWorkEventStatus.COMPLETED,
        threadId: 'thread-1',
      }),
    );
    expect(storeState.clearPendingInputRequest).toHaveBeenCalledTimes(1);
  });

  it('uses the fixed prompt bar shell layout by default', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;

    const { container } = render(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );

    const promptBarContainers = container.querySelectorAll(
      '[data-layout-mode="fixed"][data-max-width="4xl"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'true',
    );
  });

  it('supports a rail-scoped prompt bar shell layout when requested', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];

    const { container } = render(
      <AgentChatContainer
        apiService={apiService as never}
        isStreaming
        promptBarLayoutMode="surface-fixed"
      />,
    );

    const promptBarContainers = container.querySelectorAll(
      '[data-layout-mode="surface-fixed"][data-max-width="4xl"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'true',
    );
  });

  it('uses an inflow prompt bar layout on the empty state even when a surface layout is requested', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <AgentChatContainer
        apiService={apiService as never}
        promptBarLayoutMode="surface-fixed"
      />,
    );

    const promptBarContainers = container.querySelectorAll(
      '[data-layout-mode="inflow"][data-max-width="4xl"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'false',
    );
  });

  it('uses an inflow prompt bar layout on the empty state when the workspace requests viewport anchoring', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <AgentChatContainer
        apiService={apiService as never}
        promptBarLayoutMode="fixed"
      />,
    );

    const promptBarContainers = container.querySelectorAll(
      '[data-layout-mode="inflow"][data-max-width="4xl"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'false',
    );
  });

  it('widens the empty-state composer when the workspace has no outputs rail', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <AgentChatContainer
        apiService={apiService as never}
        isWideLayout
        promptBarLayoutMode="surface-fixed"
      />,
    );

    const promptBarContainers = container.querySelectorAll(
      '[data-layout-mode="inflow"][data-max-width="2xl"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'false',
    );
  });

  it('shows a loading state while a thread is being hydrated', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    render(
      <AgentChatContainer
        apiService={apiService as never}
        isLoadingThread
        isStreaming
      />,
    );

    expect(screen.getByTestId('conversation-skeleton')).toBeInTheDocument();
  });

  it('renders the active conversation title inside the conversation column', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    storeState.threads = [
      {
        id: 'thread-1',
        title: 'Prompts: Thumbnails',
      },
    ];

    render(<AgentChatContainer apiService={apiService as never} />);

    expect(screen.getByText('Prompts: Thumbnails')).toBeInTheDocument();
  });

  it('scrolls to the latest message after thread hydration finishes', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { rerender } = render(
      <AgentChatContainer apiService={apiService as never} isLoadingThread />,
    );

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    storeState.messages = [buildAssistantMessage()];

    rerender(<AgentChatContainer apiService={apiService as never} />);

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('renders contextual suggested actions through the shared prompt bar suggestions UI', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          {
            id: 'create-plan',
            label: 'Create a plan',
            prompt: 'Create a plan for this thread',
          },
          {
            id: 'use-plan-mode',
            label: 'Use plan mode',
            prompt: 'Use plan mode in this thread',
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Create a plan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Use plan mode' }),
    ).toBeInTheDocument();
  });

  it('submits a shared suggestion chip through chat send in the empty state', async () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          {
            id: 'review',
            label: 'Review',
            prompt: 'Review the current branch',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    expect(sendNonStreaming).toHaveBeenCalledWith('Review the current branch');
  });

  it('scrolls to the latest turn when retrying from an older message', async () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [
      {
        content: 'Original prompt',
        createdAt: '2026-03-10T09:59:00.000Z',
        id: 'user-original',
        role: 'user',
        threadId: 'thread-1',
      },
      buildAssistantMessage({
        content: 'Initial failed result',
        id: 'assistant-retry-target',
      }),
    ];

    render(<AgentChatContainer apiService={apiService as never} />);

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Retry message' })[0]!,
    );

    await waitFor(() => {
      expect(sendNonStreaming).toHaveBeenCalledWith('Original prompt');
    });
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  it('turns on plan mode from the suggestion shortcut without sending a prompt', async () => {
    const apiService = createApiService({
      updateThread: vi.fn().mockResolvedValue({}),
    });

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.activeThreadId = 'thread-1';

    render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          {
            id: 'use-plan-mode',
            label: 'Use plan mode',
            prompt: 'Use plan mode in this thread',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use plan mode' }));

    await waitFor(() => {
      expect(apiService.updateThread).toHaveBeenCalledWith('thread-1', {
        planModeEnabled: true,
      });
    });
    expect(sendNonStreaming).not.toHaveBeenCalled();
  });

  it('renders the composer alongside a non-empty conversation when suggested actions are provided', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];

    render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          {
            id: 'iterate',
            label: 'Make variations',
            prompt: 'Make three stronger variations of this result',
          },
        ]}
      />,
    );

    expect(screen.getByText('message')).toBeInTheDocument();
    expect(screen.getByText('chat-input stop-visible')).toBeInTheDocument();
  });

  it('renders a streaming row when the agent is active and keeps stop visible in the composer', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    storeState.runStartedAt = new Date(Date.now() - 5_000).toISOString();
    storeState.stream.streamingContent = 'Partial answer';
    isStreamingHookActive = true;

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    expect(screen.getByText(/streaming-row/)).toBeInTheDocument();
    expect(screen.getByText('chat-input stop-visible')).toBeInTheDocument();
  });

  it('renders the latest proposed plan inline for review', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    storeState.latestProposedPlan = {
      content: '1. Add a toggle\n2. Pause after planning',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };

    render(<AgentChatContainer apiService={apiService as never} />);

    expect(screen.getByTestId('agent-plan-review-card')).toBeInTheDocument();
    expect(screen.getByText('Approve')).toBeInTheDocument();
    expect(screen.getByText('Request changes')).toBeInTheDocument();
  });

  it('renders and executes the create follow-up tasks action for approved workspace plans', async () => {
    const apiService = createApiService();
    const onCreateFollowUpTasks = vi
      .fn()
      .mockResolvedValue({ createdCount: 2 });

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    storeState.latestProposedPlan = {
      content: '1. Draft the follow-up post\n2. Create a companion image',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-approved',
      status: 'approved',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };

    render(
      <AgentChatContainer
        apiService={apiService as never}
        onCreateFollowUpTasks={onCreateFollowUpTasks}
        workspacePlanningTaskId="workspace-task-42"
      />,
    );

    fireEvent.click(screen.getByText('Create Follow-up Tasks'));

    await waitFor(() => {
      expect(onCreateFollowUpTasks).toHaveBeenCalledWith('workspace-task-42');
    });

    expect(screen.getByText('Created 2 follow-up tasks.')).toBeInTheDocument();
  });

  it('does not fall back to the empty state when a restored thread only has a proposed plan', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.latestProposedPlan = {
      content: '1. Add a toggle\n2. Pause after planning',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-empty-thread',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };

    render(
      <AgentChatContainer
        apiService={apiService as never}
        emptyStateTitle="Start a chat"
      />,
    );

    expect(screen.getByTestId('agent-plan-review-card')).toBeInTheDocument();
    expect(screen.queryByText('Start a chat')).not.toBeInTheDocument();
  });

  it('renders workflow-created links from ui actions', async () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [
      buildAssistantMessage({
        content: 'Recurring automation created.',
        id: 'm-task',
        metadata: {
          uiActions: [
            {
              ctas: [
                {
                  href: '/workflows/wf-42',
                  label: 'Open workflow',
                },
              ],
              id: 'workflow-created-1',
              title: 'Automation created',
              type: 'workflow_created_card',
            },
          ],
        },
      }),
    ];

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    expect(
      await screen.findByRole('link', { name: 'Open workflow' }),
    ).toHaveAttribute('href', '/workflows/wf-42');
  });

  it('submits workflow confirmation through the UI action endpoint', async () => {
    const apiService = createApiService({
      respondToUiAction: vi.fn().mockResolvedValue({
        creditsRemaining: 48,
        creditsUsed: 0,
        message: {
          content: 'Official workflow installed.',
          metadata: {
            uiActions: [
              {
                ctas: [
                  {
                    href: '/workflows/wf-99',
                    label: 'Open workflow',
                  },
                ],
                id: 'workflow-created-success',
                title: 'Automation installed',
                type: 'workflow_created_card',
              },
            ],
          },
          role: 'assistant',
        },
        threadId: 'thread-1',
        toolCalls: [],
      }),
    });

    storeState.pendingInputRequest = null;
    storeState.messages = [
      buildAssistantMessage({
        content: 'Install this workflow?',
        id: 'm-action',
        metadata: {
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_install_official_workflow',
                  label: 'Confirm install',
                  payload: { sourceId: 'template-1' },
                },
              ],
              id: 'workflow-created-preview',
              title: 'Install official workflow?',
              type: 'workflow_created_card',
            },
          ],
        },
      }),
    ];

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm install' }));

    await waitFor(() => {
      expect(apiService.respondToUiAction).toHaveBeenCalledWith(
        'thread-1',
        'confirm_install_official_workflow',
        { sourceId: 'template-1' },
      );
    });

    expect(sendNonStreaming).not.toHaveBeenCalled();
    expect(sendStreaming).not.toHaveBeenCalled();
    expect(storeState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'Official workflow installed.',
        threadId: 'thread-1',
      }),
    );
  });

  it('renders the provided empty-state title and description', () => {
    storeState.messages = [];
    storeState.error = null;
    storeState.isGenerating = false;
    storeState.pendingInputRequest = null;

    render(
      <AgentChatContainer
        apiService={createApiService() as never}
        emptyStateTitle="Start a chat"
        emptyStateDescription="Ask for help planning content."
        placeholder="Ask for help with content..."
      />,
    );

    expect(screen.getByText('Start a chat')).toBeInTheDocument();
    expect(
      screen.getByText('Ask for help planning content.'),
    ).toBeInTheDocument();
  });
});
