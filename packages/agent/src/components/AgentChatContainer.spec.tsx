import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import {
  type AgentChatMessage as AgentChatMessageType,
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNonStreaming = vi.fn();
const sendStreaming = vi.fn();
let isStreamingHookActive = false;
const scrollIntoViewMock = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => null,
}));

vi.mock('@genfeedai/auth-client/react', () => ({
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
    containerRef?: (node: HTMLDivElement | null) => void;
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
        ref={props.containerRef}
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
  AgentChatInput: function MockAgentChatInput(props: {
    density?: string;
    onStop?: () => void | Promise<void>;
    showStop?: boolean;
  }) {
    return (
      <div data-density={props.density} data-testid="chat-input">
        chat-input
        {props.showStop ? (
          <button type="button" onClick={props.onStop}>
            Stop agent
          </button>
        ) : null}
      </div>
    );
  },
}));

vi.mock('@genfeedai/agent/components/AgentChatMessage', () => ({
  AgentChatMessage: function MockAgentChatMessage(props: {
    isRetryableUserPrompt?: boolean;
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
        {props.isRetryableUserPrompt ? (
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
              onClick={() => props.onUiAction?.(cta.action, cta.payload)}
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
  clearStaleActiveRun: ReturnType<typeof vi.fn>;
  draftPlanModeEnabled: boolean;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  latestProposedPlan: null | {
    id: string;
    status?: string;
    content?: string;
    createdAt: string;
    updatedAt: string;
  };
  threads: Array<{
    brandId?: string | null;
    contextVersion?: number;
    id: string;
    source?: string;
    title?: string;
  }>;
  error: string | null;
  isGenerating: boolean;
  messages: AgentChatMessageType[];
  messagesCursor: string | null;
  prependOlderMessages: ReturnType<typeof vi.fn>;
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
  socketConnectionState: 'connected';
  setActiveThread: ReturnType<typeof vi.fn>;
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveRunStatus: ReturnType<typeof vi.fn>;
  setCreditsRemaining: ReturnType<typeof vi.fn>;
  setDraftPlanModeEnabled: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setLatestProposedPlan: ReturnType<typeof vi.fn>;
  setIsLoadingOlderMessages: ReturnType<typeof vi.fn>;
  setUiActionStatus: ReturnType<typeof vi.fn>;
  stream: {
    activeToolCalls: [];
    isStreaming: boolean;
    pendingUiActions: Array<{
      generationType?: 'image' | 'video';
      id: string;
      title: string;
      type: string;
    }>;
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
  clearStaleActiveRun: vi.fn(),
  draftPlanModeEnabled: false,
  error: null,
  hasMoreMessages: false,
  isLoadingOlderMessages: false,
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
  messagesCursor: null,
  prependOlderMessages: vi.fn((page) => {
    storeState.messages = [...page.messages, ...storeState.messages];
    storeState.hasMoreMessages = page.hasMore;
    storeState.messagesCursor = page.nextCursor;
  }),
  runStartedAt: null,
  socketConnectionState: 'connected',
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
  setIsLoadingOlderMessages: vi.fn((loading: boolean) => {
    storeState.isLoadingOlderMessages = loading;
  }),
  setUiActionStatus: vi.fn(),
  stream: {
    activeToolCalls: [],
    isStreaming: false,
    pendingUiActions: [],
    streamingContent: '',
    streamingReasoning: '',
  },
  threads: [],
  updateThread: vi.fn(),
  upsertThread: vi.fn(),
  workEvents: [],
};

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    cancelWorkflowExecution: vi.fn(),
    getActiveWorkflowExecutions: vi.fn().mockResolvedValue([]),
    getMessagesPage: vi.fn(),
    respondToInputRequest: vi.fn(),
    respondToUiAction: vi.fn(),
    updateThread: vi.fn(),
    uploadAttachment: vi.fn(),
    ...overrides,
  };
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
  useAgentChatStore: Object.assign(
    (selector: (state: StoreState) => unknown) => selector(storeState),
    { getState: () => storeState },
  ),
}));

import { AgentChatContainer } from '@genfeedai/agent/components/AgentChatContainer';
import { ConversationComposerShellProvider } from '@genfeedai/agent/components/ConversationComposerShellContext';

describe('AgentChatContainer', () => {
  beforeAll(() => {
    const domElement = globalThis.window?.HTMLElement;
    if (domElement) {
      Object.defineProperty(domElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoViewMock,
      });
    }
  });

  beforeEach(() => {
    isStreamingHookActive = false;
    scrollIntoViewMock.mockReset();
    sendNonStreaming.mockReset();
    sendStreaming.mockReset();
    storeState.addMessage.mockReset();
    storeState.addWorkEvent.mockReset();
    storeState.clearPendingInputRequest.mockReset();
    storeState.clearStaleActiveRun.mockReset();
    storeState.prependOlderMessages.mockClear();
    storeState.setActiveThread.mockReset();
    storeState.setActiveRun.mockReset();
    storeState.setActiveRunStatus.mockReset();
    storeState.setCreditsRemaining.mockReset();
    storeState.setDraftPlanModeEnabled.mockReset();
    storeState.setError.mockReset();
    storeState.setLatestProposedPlan.mockReset();
    storeState.setIsLoadingOlderMessages.mockClear();
    storeState.setUiActionStatus.mockReset();
    storeState.upsertThread.mockReset();
    storeState.updateThread.mockReset();
    storeState.activeThreadId = 'thread-1';
    storeState.draftPlanModeEnabled = false;
    storeState.error = null;
    storeState.hasMoreMessages = false;
    storeState.isLoadingOlderMessages = false;
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
    storeState.isGenerating = false;
    storeState.stream.isStreaming = false;
    storeState.messagesCursor = null;
    storeState.runStartedAt = null;
    storeState.stream.pendingUiActions = [];
    storeState.stream.streamingContent = '';
    storeState.workEvents = [];
    storeState.threads = [];
    storeState.isGenerating = false;
    storeState.error = null;
    storeState.activeRunId = 'run-1';
    storeState.activeRunStatus = 'running';
  });

  it('clears a stale local run when the server has no active execution for the thread', async () => {
    const apiService = createApiService();
    storeState.activeRunId = 'run-stale';
    storeState.activeRunStatus = 'running';

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    await waitFor(() => {
      expect(storeState.clearStaleActiveRun).toHaveBeenCalledTimes(1);
    });
  });

  it('restores a pending execution as active and allows it to be stopped', async () => {
    const apiService = createApiService({
      getActiveWorkflowExecutions: vi.fn().mockResolvedValue([
        {
          id: 'run-pending',
          metadata: { threadId: 'thread-1' },
          status: 'PENDING',
        },
      ]),
    });
    storeState.activeRunId = 'run-pending';
    storeState.activeRunStatus = 'idle';
    storeState.setActiveRun.mockImplementation((id, options) => {
      storeState.activeRunId = id;
      storeState.activeRunStatus = options.status;
    });
    const view = render(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );
    await waitFor(() =>
      expect(storeState.setActiveRun).toHaveBeenCalledWith('run-pending', {
        startedAt: null,
        status: 'running',
      }),
    );
    view.rerender(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));
    await waitFor(() =>
      expect(apiService.cancelWorkflowExecution).toHaveBeenCalledWith(
        'run-pending',
      ),
    );
  });

  it('reconciles a terminal snapshot run that arrives after the first active execution query', async () => {
    const apiService = createApiService();
    storeState.activeRunId = null;

    const view = render(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );

    await waitFor(() => {
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledTimes(1);
    });
    expect(storeState.clearStaleActiveRun).not.toHaveBeenCalled();

    storeState.activeRunId = 'run-from-terminal-snapshot';
    view.rerender(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );

    await waitFor(() => {
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledTimes(2);
      expect(storeState.clearStaleActiveRun).toHaveBeenCalledTimes(1);
    });
  });

  it('does not clear a newer run that starts while active execution recovery is pending', async () => {
    let resolveExecutions: (executions: []) => void = () => undefined;
    const apiService = createApiService({
      getActiveWorkflowExecutions: vi.fn(
        () =>
          new Promise<[]>((resolve) => {
            resolveExecutions = resolve;
          }),
      ),
    });
    storeState.activeRunId = 'run-stale';

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    await waitFor(() => {
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledTimes(1);
    });
    storeState.activeRunId = 'run-new';
    resolveExecutions([]);

    await act(async () => {
      await Promise.resolve();
    });
    expect(storeState.clearStaleActiveRun).not.toHaveBeenCalled();
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
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];

    // Production always mounts the container under the workspace shell's
    // composer provider; input requests render in the composer status stack.
    render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:1"
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} isStreaming />
      </ConversationComposerShellProvider>,
    );

    fireEvent.click(screen.getByText('Submit requested input'));

    await waitFor(() => {
      expect(apiService.respondToInputRequest).toHaveBeenCalledWith(
        'thread-1',
        'input-1',
        'Use the hybrid prompt bar',
        undefined,
        { brandId: null, expectedContextVersion: 1 },
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

  it('keeps legacy generation actions out of the docked composer', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.stream.pendingUiActions = [
      {
        generationType: 'video',
        id: 'generation-video',
        title: 'Generate Video',
        type: 'generation_action_card',
      },
    ];
    storeState.messages = [
      {
        content: 'Configure the image before generation.',
        createdAt: '2026-08-05T12:00:00.000Z',
        id: 'generation-message-1',
        metadata: {
          uiActions: [
            {
              generationType: 'image',
              id: 'generation-action-1',
              title: 'Generate image ingredient',
              type: 'generation_action_card',
            },
          ],
        },
        role: 'assistant',
        threadId: 'thread-1',
      },
    ];

    render(<AgentChatContainer apiService={apiService as never} />);

    expect(screen.queryByTestId('composer-generation-card')).toBeNull();
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
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

  it('renders a full-width rail composer in the inspector portal', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];

    render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="inspector"
        portalTarget={portalTarget}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} isStreaming />
      </ConversationComposerShellProvider>,
    );

    const portaled = portalTarget.querySelector(
      '[data-layout-mode="inflow"][data-max-width="full"]',
    );
    expect(portaled).not.toBeNull();
    expect(portaled?.getAttribute('data-show-top-fade')).toBe('true');
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-density',
      'inspector',
    );
    portalTarget.remove();
  });

  it('pads the transcript under a portaled surface composer without a black fade slab', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="surface"
        portalTarget={portalTarget}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} isStreaming />
      </ConversationComposerShellProvider>,
    );

    expect(
      container.querySelector('[data-composer-padding="128"]'),
    ).not.toBeNull();
    expect(
      portalTarget.querySelector(
        '[data-layout-mode="inflow"][data-show-top-fade="true"]',
      ),
    ).not.toBeNull();

    portalTarget.remove();
  });

  it('includes the surface dock inset when padding the transcript', async () => {
    const apiService = createApiService();
    const composerDock = document.createElement('div');
    const portalTarget = document.createElement('div');
    composerDock.append(portalTarget);
    document.body.append(composerDock);
    vi.spyOn(composerDock, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ height: 297 }),
    );

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="surface"
        portalTarget={portalTarget}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} isStreaming />
      </ConversationComposerShellProvider>,
    );

    await waitFor(() => {
      expect(
        container.querySelector('[data-composer-padding="313"]'),
      ).not.toBeNull();
    });

    composerDock.remove();
  });

  it('does not render a conversation composer when the product surface owns the primary input', () => {
    const apiService = createApiService();

    storeState.error = 'Inspector run failed';
    storeState.messages = [buildAssistantMessage()];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Studio"
        draftScopeKey="acme:thread-1:3"
        isComposerVisible={false}
        portalTarget={null}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} isStreaming />
      </ConversationComposerShellProvider>,
    );

    expect(container.querySelector('[data-layout-mode]')).toBeNull();
    expect(screen.queryByText('chat-input')).not.toBeInTheDocument();
    // Inline feedback uses productized error title/summary (not raw store text).
    expect(screen.getByText('Run failed')).toBeInTheDocument();
    expect(
      screen.getByText(/The agent hit an error while running/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Submit requested input')).toBeInTheDocument();
    expect(
      container.querySelector('[data-composer-padding="20"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-composer-padding="128"]')).toBeNull();
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
      '[data-layout-mode="inflow"][data-max-width="full"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'true',
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
      '[data-layout-mode="inflow"][data-max-width="full"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'true',
    );
  });

  it('puts the onboarding card on the empty conversation prompt bar', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <AgentChatContainer
        apiService={apiService as never}
        emptyStateTitle="Welcome to GenFeed"
        onboardingMode
        promptBarLayoutMode="surface-fixed"
      />,
    );

    expect(screen.getByTestId('onboarding-composer-card')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /start with my first image/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/what best describes you/i),
    ).not.toBeInTheDocument();
    expect(
      container.querySelectorAll(
        '[data-layout-mode="inflow"][data-max-width="full"]',
      ).length,
    ).toBe(1);
    expect(
      container.querySelector(
        '[data-layout-mode="inflow"] [data-testid="onboarding-composer-card"]',
      ),
    ).not.toBeNull();
  });

  it('keeps the empty-state composer full-width inside the centered column', () => {
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
      '[data-layout-mode="inflow"][data-max-width="full"]',
    );

    expect(promptBarContainers.length).toBe(1);
    expect(promptBarContainers[0]?.getAttribute('data-show-top-fade')).toBe(
      'true',
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

  it('loads older messages near the top and preserves the visible scroll anchor', async () => {
    const olderMessage = buildAssistantMessage({
      content: 'Older reply',
      id: 'm-older',
    });
    const getMessagesPage = vi.fn().mockResolvedValue({
      hasMore: false,
      messages: [olderMessage],
      nextCursor: null,
    });
    const apiService = createApiService({ getMessagesPage });
    storeState.pendingInputRequest = null;
    storeState.hasMoreMessages = true;
    storeState.messagesCursor = 'cursor-older';

    const view = render(
      <AgentChatContainer apiService={apiService as never} />,
    );
    const scrollContainer = view.container.querySelector('.overflow-y-auto');
    if (!(scrollContainer instanceof HTMLDivElement)) {
      throw new Error('Conversation scroll container not found');
    }

    let scrollHeight = 1_000;
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: {
        configurable: true,
        get: () => scrollHeight,
      },
    });
    scrollContainer.scrollTop = 20;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(getMessagesPage).toHaveBeenCalledWith(
        'thread-1',
        { cursor: 'cursor-older', limit: AGENT_MESSAGE_PAGE_SIZE },
        expect.any(AbortSignal),
      );
    });
    await waitFor(() => {
      expect(storeState.prependOlderMessages).toHaveBeenCalledTimes(1);
    });

    scrollHeight = 1_400;
    view.rerender(<AgentChatContainer apiService={apiService as never} />);

    expect(scrollContainer.scrollTop).toBe(420);
  });

  it('drops an older-page response that resolves after the active thread changes', async () => {
    let resolvePage:
      | ((page: {
          hasMore: boolean;
          messages: AgentChatMessageType[];
          nextCursor: string | null;
        }) => void)
      | undefined;
    const getMessagesPage = vi.fn(
      () =>
        new Promise<{
          hasMore: boolean;
          messages: AgentChatMessageType[];
          nextCursor: string | null;
        }>((resolve) => {
          resolvePage = resolve;
        }),
    );
    const apiService = createApiService({ getMessagesPage });
    storeState.pendingInputRequest = null;
    storeState.hasMoreMessages = true;
    storeState.messagesCursor = 'cursor-thread-1';

    const view = render(
      <AgentChatContainer apiService={apiService as never} />,
    );
    const scrollContainer = view.container.querySelector('.overflow-y-auto');
    if (!(scrollContainer instanceof HTMLDivElement)) {
      throw new Error('Conversation scroll container not found');
    }
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    scrollContainer.scrollTop = 20;
    fireEvent.scroll(scrollContainer);

    await waitFor(() => {
      expect(getMessagesPage).toHaveBeenCalledTimes(1);
    });

    storeState.activeThreadId = 'thread-2';
    storeState.messages = [
      buildAssistantMessage({ id: 'thread-2-message', threadId: 'thread-2' }),
    ];
    storeState.messagesCursor = 'cursor-thread-2';
    view.rerender(<AgentChatContainer apiService={apiService as never} />);

    await act(async () => {
      resolvePage?.({
        hasMore: false,
        messages: [buildAssistantMessage({ id: 'stale-older-message' })],
        nextCursor: null,
      });
      await Promise.resolve();
    });

    expect(storeState.prependOlderMessages).not.toHaveBeenCalled();
  });

  it('renders contextual suggested actions through the shared prompt bar suggestions UI without plan mode shortcuts', () => {
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
      screen.queryByRole('button', { name: 'Use plan mode' }),
    ).not.toBeInTheDocument();
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

    expect(sendNonStreaming).toHaveBeenCalledWith('Review the current branch', {
      attachments: undefined,
      planModeEnabled: false,
    });
  });

  it('queues a suggestion while a turn is in flight', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;

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

    expect(sendNonStreaming).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Review the current branch',
    );
  });

  it('queues a rapid second send after the first send marks the live transport busy', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = false;
    sendNonStreaming.mockImplementationOnce(() => {
      storeState.isGenerating = true;
    });

    render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'First turn' },
          { id: 'two', label: 'Second', prompt: 'Second turn' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    expect(sendNonStreaming).toHaveBeenCalledTimes(1);
    expect(sendNonStreaming.mock.calls[0]?.[0]).toBe('First turn');
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Second turn',
    );
  });

  it('does not offer retry on a completed historical turn while busy', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.isGenerating = true;
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

    expect(
      screen.queryByRole('button', { name: 'Retry message' }),
    ).not.toBeInTheDocument();
    expect(sendNonStreaming).not.toHaveBeenCalled();
  });

  it('dispatches queued follow-ups in FIFO order after a successful response', async () => {
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;

    const view = render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'First follow-up' },
          { id: 'two', label: 'Second', prompt: 'Second follow-up' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(sendNonStreaming).not.toHaveBeenCalled();

    storeState.isGenerating = false;
    view.rerender(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'First follow-up' },
          { id: 'two', label: 'Second', prompt: 'Second follow-up' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(sendNonStreaming).toHaveBeenCalledTimes(1);
    });
    expect(sendNonStreaming.mock.calls[0]?.[0]).toBe('First follow-up');
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Second follow-up',
    );
  });

  it('holds the queue when the active run fails without an interrupt', async () => {
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;

    const view = render(
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
    storeState.isGenerating = false;
    storeState.error = 'Generation failed';
    view.rerender(
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

    await act(async () => {
      await Promise.resolve();
    });
    expect(sendNonStreaming).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Review the current branch',
    );
  });

  it('cancels the active run before sending a queued prompt now', async () => {
    const apiService = createApiService({
      cancelWorkflowExecution: vi.fn().mockResolvedValue(undefined),
    });
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;
    storeState.activeRunId = 'run-1';
    storeState.activeRunStatus = 'running';

    const view = render(
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
    fireEvent.click(screen.getByLabelText('sendNow'));

    await waitFor(() => {
      expect(apiService.cancelWorkflowExecution).toHaveBeenCalled();
    });
    expect(sendNonStreaming).not.toHaveBeenCalled();

    storeState.isGenerating = false;
    view.rerender(
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

    await waitFor(() => {
      expect(sendNonStreaming).toHaveBeenCalledTimes(1);
    });
    expect(sendNonStreaming.mock.calls[0]?.[0]).toBe(
      'Review the current branch',
    );
  });

  it('treats a missing execution as an already-settled stop', async () => {
    const apiService = createApiService({
      cancelWorkflowExecution: vi.fn().mockRejectedValue(
        new AgentApiRequestError({
          detail: 'Execution not found',
          message: 'Failed to cancel workflow execution: 404',
          source: 'api',
          status: 404,
        }),
      ),
      getActiveWorkflowExecutions: vi.fn().mockResolvedValue([
        {
          id: 'run-1',
          metadata: { threadId: 'thread-1' },
          status: 'RUNNING',
        },
      ]),
    });
    isStreamingHookActive = true;
    storeState.activeRunId = 'run-1';
    storeState.activeRunStatus = 'running';

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop agent' }));

    await waitFor(() => {
      expect(apiService.cancelWorkflowExecution).toHaveBeenCalledWith('run-1');
    });
    expect(storeState.clearStaleActiveRun).toHaveBeenCalledTimes(1);
    expect(storeState.setError).not.toHaveBeenCalledWith(
      'Failed to stop the active agent run.',
    );
  });

  it('keeps queued prompts isolated per conversation', () => {
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;
    storeState.activeThreadId = 'thread-1';

    const view = render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'One', prompt: 'Thread one follow-up' },
          { id: 'two', label: 'Two', prompt: 'Thread two follow-up' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Thread one follow-up',
    );

    storeState.activeThreadId = 'thread-2';
    view.rerender(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'One', prompt: 'Thread one follow-up' },
          { id: 'two', label: 'Two', prompt: 'Thread two follow-up' },
        ]}
      />,
    );
    expect(
      screen.queryByTestId('composer-follow-up-queue'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Two' }));
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Thread two follow-up',
    );

    storeState.activeThreadId = 'thread-1';
    view.rerender(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'One', prompt: 'Thread one follow-up' },
          { id: 'two', label: 'Two', prompt: 'Thread two follow-up' },
        ]}
      />,
    );
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Thread one follow-up',
    );
  });

  it('keeps a failed queued dispatch visible and does not send later prompts', async () => {
    sendNonStreaming.mockRejectedValueOnce(new Error('dispatch failed'));
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;

    const view = render(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'First follow-up' },
          { id: 'two', label: 'Second', prompt: 'Second follow-up' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));

    storeState.isGenerating = false;
    view.rerender(
      <AgentChatContainer
        apiService={apiService as never}
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'First follow-up' },
          { id: 'two', label: 'Second', prompt: 'Second follow-up' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(sendNonStreaming).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'First follow-up',
    );
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'Second follow-up',
    );
    await waitFor(() => {
      expect(screen.getByLabelText('retry')).toBeInTheDocument();
    });
    expect(sendNonStreaming.mock.calls[0]?.[0]).toBe('First follow-up');
  });

  it('dispatches queued follow-ups in FIFO order for streaming sends', async () => {
    isStreamingHookActive = true;
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    storeState.isGenerating = true;

    const view = render(
      <AgentChatContainer
        apiService={apiService as never}
        isStreaming
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'Stream first' },
          { id: 'two', label: 'Second', prompt: 'Stream second' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(sendStreaming).not.toHaveBeenCalled();

    storeState.isGenerating = false;
    isStreamingHookActive = false;
    view.rerender(
      <AgentChatContainer
        apiService={apiService as never}
        isStreaming
        suggestedActions={[
          { id: 'one', label: 'First', prompt: 'Stream first' },
          { id: 'two', label: 'Second', prompt: 'Stream second' },
        ]}
      />,
    );

    await waitFor(() => {
      expect(sendStreaming).toHaveBeenCalledTimes(1);
    });
    expect(sendStreaming.mock.calls[0]?.[0]).toBe('Stream first');
  });

  it('retries the user prompt that owns the terminal failure', async () => {
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
    ];
    storeState.workEvents = [
      {
        createdAt: '2026-03-10T10:00:00.000Z',
        detail: 'Request failed with status code 503',
        event: AgentWorkEventType.FAILED,
        id: 'failed-run-event',
        label: 'Generation failed',
        runId: 'run-failed',
        status: AgentWorkEventStatus.FAILED,
        threadId: 'thread-1',
        toolName: 'generate_image',
      },
    ];

    render(<AgentChatContainer apiService={apiService as never} />);

    const retryButton = screen.getByRole('button', {
      name: 'Retry message',
    });

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(sendNonStreaming).toHaveBeenCalledWith(
        'Original prompt',
        expect.objectContaining({ planModeEnabled: false }),
      );
    });
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth' });
    });
  });

  it('filters the plan mode suggestion shortcut without sending a prompt', async () => {
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

    expect(
      screen.queryByRole('button', { name: 'Use plan mode' }),
    ).not.toBeInTheDocument();
    expect(apiService.updateThread).not.toHaveBeenCalled();
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
    expect(
      screen.getByRole('button', { name: 'Stop agent' }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole('button', { name: 'Stop agent' }),
    ).toBeInTheDocument();
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

    expect(
      await screen.findByText((_, element) => {
        return element?.textContent === 'Created 2 follow-up tasks.';
      }),
    ).toBeInTheDocument();
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
                  href: '/automation/workflows/wf-42',
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
    ).toHaveAttribute('href', '/automation/workflows/wf-42');
  });

  it('submits workflow confirmation through the UI action endpoint', async () => {
    const apiService = createApiService({
      respondToUiAction: vi.fn().mockResolvedValue({
        contextVersion: 1,
        creditsRemaining: 48,
        creditsUsed: 0,
        message: {
          content: 'Official workflow installed.',
          metadata: {
            uiActions: [
              {
                ctas: [
                  {
                    href: '/automation/workflows/wf-99',
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
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];
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
        undefined,
        { brandId: null, expectedContextVersion: 1 },
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

  it('ignores a duplicate UI action while the first request is pending', async () => {
    let resolveAction: ((value: Record<string, unknown>) => void) | undefined;
    const pendingAction = new Promise<Record<string, unknown>>((resolve) => {
      resolveAction = resolve;
    });
    const respondToUiAction = vi.fn(() => pendingAction);
    const apiService = createApiService({ respondToUiAction });

    storeState.pendingInputRequest = null;
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];
    storeState.messages = [
      buildAssistantMessage({
        content: 'Install this workflow?',
        id: 'm-action-pending',
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
              id: 'workflow-created-pending',
              title: 'Install official workflow?',
              type: 'workflow_created_card',
            },
          ],
        },
      }),
    ];

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    const confirmButton = screen.getByRole('button', {
      name: 'Confirm install',
    });
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(respondToUiAction).toHaveBeenCalledTimes(1));
    expect(storeState.setError).not.toHaveBeenCalledWith(
      'A UI action is already in progress.',
    );

    resolveAction?.({
      contextVersion: 1,
      creditsRemaining: 48,
      creditsUsed: 0,
      message: { content: 'Installed.', metadata: {}, role: 'assistant' },
      threadId: 'thread-1',
      toolCalls: [],
    });

    await waitFor(() => {
      expect(storeState.addMessage).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'Installed.' }),
      );
    });
  });

  it('replaces a brandless thread scope with the confirmed created brand', async () => {
    const apiService = createApiService({
      respondToUiAction: vi.fn().mockResolvedValue({
        brandId: 'brand-created-1',
        contextVersion: 2,
        creditsRemaining: 48,
        creditsUsed: 0,
        message: {
          content: 'Brand created and selected for this thread.',
          metadata: {},
          role: 'assistant',
        },
        threadId: 'thread-1',
        toolCalls: [],
      }),
    });

    storeState.pendingInputRequest = null;
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];
    storeState.messages = [
      buildAssistantMessage({
        content: 'Create this brand?',
        id: 'm-brand-confirmation',
        metadata: {
          uiActions: [
            {
              ctas: [
                {
                  action: 'confirm_create_brand',
                  label: 'Confirm create',
                  payload: {
                    description: 'AI content operations',
                    label: 'Genfeed',
                    slug: 'genfeed',
                    sourceActionId: 'source-create-1',
                  },
                },
              ],
              data: {
                operation: 'create',
                proposal: {
                  description: 'AI content operations',
                  label: 'Genfeed',
                  slug: 'genfeed',
                },
                sourceActionId: 'source-create-1',
              },
              id: 'brand-confirmation-1',
              title: 'Create this brand?',
              type: 'brand_identity_confirmation_card',
            },
          ],
        },
      }),
    ];

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm create' }));

    await waitFor(() => {
      expect(apiService.respondToUiAction).toHaveBeenCalledWith(
        'thread-1',
        'confirm_create_brand',
        {
          description: 'AI content operations',
          label: 'Genfeed',
          slug: 'genfeed',
          sourceActionId: 'source-create-1',
        },
        undefined,
        { brandId: null, expectedContextVersion: 1 },
      );
    });
    await waitFor(() => {
      expect(storeState.upsertThread).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-created-1',
          contextVersion: 2,
          id: 'thread-1',
        }),
      );
    });
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

  it('keeps the empty-state composer inline instead of portaling into the shell slot', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="surface"
        portalTarget={portalTarget}
        shellState="canvas"
      >
        <AgentChatContainer apiService={apiService as never} />
      </ConversationComposerShellProvider>,
    );

    expect(
      container.querySelector(
        '[data-layout-mode="inflow"][data-max-width="full"]',
      ),
    ).not.toBeNull();
    expect(portalTarget).toBeEmptyDOMElement();

    portalTarget.remove();
  });

  it('docks the inspector empty-state composer into the shell slot', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="inspector"
        portalTarget={portalTarget}
        shellState="canvas"
      >
        <AgentChatContainer
          apiService={apiService as never}
          emptyStateTitle="Start a conversation"
        />
      </ConversationComposerShellProvider>,
    );

    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="agent-chat-input-shell"]'),
    ).toBeNull();
    expect(
      portalTarget.querySelector('[data-layout-mode="inflow"]'),
    ).not.toBeNull();

    portalTarget.remove();
  });
});
