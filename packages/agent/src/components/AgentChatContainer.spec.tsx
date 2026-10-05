import { AGENT_MESSAGE_PAGE_SIZE } from '@genfeedai/agent/constants/agent-message-pagination.constant';
import {
  type AgentChatMessage as AgentChatMessageType,
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentApiRequestError } from '@genfeedai/agent/services/agent-api-error';
import {
  type AgentRunRecord,
  IDLE_RUN,
  runKeyFor,
} from '@genfeedai/agent/stores/agent-chat.store.run';
import { AgentThreadMode } from '@genfeedai/contracts';
import { ONBOARDING_GREETING } from '@genfeedai/contracts/constants';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/agent/components/AgentWorkObjects', () => ({
  AgentWorkObjects: () => null,
}));

const sendNonStreaming = vi.fn();
const sendStreaming = vi.fn();
/** What the composer's `onSend` returned; false keeps the draft. */
const composerSendResults: Array<boolean | undefined> = [];
const adoptRun = vi.fn();
const beginRunHandoff = vi.fn((threadId: string) => ({
  generation: 1,
  previousPending: null,
  previousRunId: null,
  threadId,
}));
const cancelRunHandoff = vi.fn();
let isStreamingHookActive = false;
const scrollIntoViewMock = vi.fn();
const { pinConversationScrollToBottomMock } = vi.hoisted(() => ({
  pinConversationScrollToBottomMock: vi.fn(),
}));

vi.mock(
  '@genfeedai/agent/utils/conversation-scroll.util',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@genfeedai/agent/utils/conversation-scroll.util')
      >();
    return {
      ...actual,
      pinConversationScrollToBottom: (
        ...args: Parameters<typeof actual.pinConversationScrollToBottom>
      ) => pinConversationScrollToBottomMock(...args),
    };
  },
);

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
    isVisible?: boolean;
    layoutMode?: string;
    maxWidth?: string;
    showTopFade?: boolean;
    topContent?: ReactNode;
  }) {
    if (props.isVisible === false) {
      return null;
    }

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
    adoptRun,
    beginRunHandoff,
    cancelRunHandoff,
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
    placeholder?: string;
    onSend?: (content: string) => boolean;
    onStop?: () => void | Promise<void>;
    showStop?: boolean;
  }) {
    return (
      <div data-density={props.density} data-testid="chat-input">
        chat-input
        <input
          aria-label="Composer paste"
          placeholder={props.placeholder}
          onPaste={(event) => {
            composerSendResults.push(
              props.onSend?.(event.clipboardData.getData('text')),
            );
          }}
        />
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
      content?: string;
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
        <span>{props.message?.content}</span>
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
  addMessage: ReturnType<typeof vi.fn>;
  addWorkEvent: ReturnType<typeof vi.fn>;
  clearPendingInputRequest: ReturnType<typeof vi.fn>;
  setPendingInputRequest: ReturnType<typeof vi.fn>;
  clearStaleActiveRun: ReturnType<typeof vi.fn>;
  markStreamLive: ReturnType<typeof vi.fn>;
  draftAgentMode: AgentThreadMode;
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
    runtimeKey?: string;
    source?: string;
    title?: string;
  }>;
  draftRuntimeKey: string | null;
  setDraftRuntimeKey: ReturnType<typeof vi.fn>;
  conversationCacheByThread: Record<string, unknown>;
  error: string | null;
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
  runsByThread: Record<string, AgentRunRecord>;
  socketConnectionState: 'connected';
  setActiveThread: ReturnType<typeof vi.fn>;
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveRunStatus: ReturnType<typeof vi.fn>;
  setCreditsRemaining: ReturnType<typeof vi.fn>;
  setDraftAgentMode: ReturnType<typeof vi.fn>;
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
  trackUiActionRun: ReturnType<typeof vi.fn>;
  uiActionStatesByThread: Record<string, Record<string, unknown>>;
  upsertThread: ReturnType<typeof vi.fn>;
  updateThread: ReturnType<typeof vi.fn>;
  workEvents: [];
};

function setRun(patch: Partial<AgentRunRecord>): void {
  const key = runKeyFor(storeState.activeThreadId);
  storeState.runsByThread = {
    ...storeState.runsByThread,
    [key]: { ...IDLE_RUN, ...storeState.runsByThread[key], ...patch },
  };
}

const storeState: StoreState = {
  activeThreadId: 'thread-1',
  addMessage: vi.fn(),
  addWorkEvent: vi.fn(),
  clearPendingInputRequest: vi.fn(),
  setPendingInputRequest: vi.fn(),
  clearStaleActiveRun: vi.fn(),
  markStreamLive: vi.fn(),
  conversationCacheByThread: {},
  draftAgentMode: AgentThreadMode.MANUAL,
  draftRuntimeKey: null,
  error: null,
  hasMoreMessages: false,
  isLoadingOlderMessages: false,
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
  runsByThread: {
    'thread-1': { ...IDLE_RUN, runId: 'run-1' },
  },
  socketConnectionState: 'connected',
  setActiveRun: vi.fn(),
  setActiveRunStatus: vi.fn(),
  setActiveThread: vi.fn(),
  setCreditsRemaining: vi.fn(),
  setDraftAgentMode: vi.fn((mode: AgentThreadMode) => {
    storeState.draftAgentMode = mode;
  }),
  setDraftRuntimeKey: vi.fn(),
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
  trackUiActionRun: vi.fn(),
  uiActionStatesByThread: {},
  updateThread: vi.fn(),
  upsertThread: vi.fn(),
  workEvents: [],
};

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    cancelWorkflowExecution: vi.fn(),
    getActiveWorkflowExecutions: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn(),
    getMessagesPage: vi.fn(),
    respondToInputRequest: vi.fn(),
    respondToUiAction: vi.fn(),
    updateThread: vi.fn(),
    uploadAttachment: vi.fn(),
    ...overrides,
  };
}

/**
 * `POST .../ui-actions` only acks the enqueued workflow. The run's result
 * reaches the thread as its own `agent:done`, so the api double has no read
 * methods: the container must never poll messages or the execution for it.
 */
function createUiActionApi() {
  return {
    getMessages: vi.fn(() => {
      throw new Error('ui-actions must not poll messages');
    }),
    getWorkflowExecution: vi.fn(() => {
      throw new Error('ui-actions must not poll the execution');
    }),
    respondToUiAction: vi.fn().mockResolvedValue({
      executionId: 'exec-ui-action',
      status: 'queued',
      threadId: 'thread-1',
    }),
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
import { resetDesktopLocalToolsCache } from '@genfeedai/agent/hooks/use-desktop-local-tools';
import { DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE } from '@genfeedai/agent/utils/agent-runtime-options.util';

type DesktopWindow = Window & { genfeedDesktop?: unknown };

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
    pinConversationScrollToBottomMock.mockReset();
    sendNonStreaming.mockReset();
    sendStreaming.mockReset();
    composerSendResults.length = 0;
    adoptRun.mockReset();
    beginRunHandoff.mockClear();
    cancelRunHandoff.mockReset();
    storeState.addMessage.mockReset();
    storeState.addWorkEvent.mockReset();
    storeState.clearPendingInputRequest.mockReset();
    storeState.setPendingInputRequest.mockReset();
    storeState.clearStaleActiveRun.mockReset();
    storeState.markStreamLive.mockReset();
    storeState.prependOlderMessages.mockClear();
    storeState.setActiveThread.mockReset();
    storeState.setActiveRun.mockReset();
    storeState.setActiveRunStatus.mockReset();
    storeState.setCreditsRemaining.mockReset();
    storeState.setDraftAgentMode.mockReset();
    storeState.setError.mockReset();
    storeState.setLatestProposedPlan.mockReset();
    storeState.setIsLoadingOlderMessages.mockClear();
    storeState.setUiActionStatus.mockReset();
    storeState.trackUiActionRun.mockReset();
    storeState.uiActionStatesByThread = {};
    storeState.conversationCacheByThread = {};
    storeState.upsertThread.mockReset();
    storeState.updateThread.mockReset();
    storeState.activeThreadId = 'thread-1';
    storeState.draftAgentMode = AgentThreadMode.MANUAL;
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
    storeState.runsByThread = {};
    storeState.stream.isStreaming = false;
    storeState.messagesCursor = null;
    setRun({ startedAt: null });
    storeState.stream.pendingUiActions = [];
    storeState.stream.streamingContent = '';
    storeState.workEvents = [];
    storeState.threads = [];
    storeState.draftRuntimeKey = null;
    setRun({ isGenerating: false });
    storeState.error = null;
    setRun({ runId: 'run-1' });
    setRun({ status: 'idle' });
  });

  it('clears a stale local run when the server has no active execution for the thread', async () => {
    const apiService = createApiService();
    setRun({ runId: 'run-stale' });
    setRun({ status: 'running' });

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    await waitFor(() => {
      expect(storeState.clearStaleActiveRun).toHaveBeenCalledTimes(1);
    });
  });

  it('adopts a restored running execution as a live stream', async () => {
    const apiService = createApiService({
      getActiveWorkflowExecutions: vi.fn().mockResolvedValue([
        {
          id: 'run-1',
          metadata: { threadId: 'thread-1' },
          startedAt: '2026-09-23T15:06:00.000Z',
          status: 'RUNNING',
        },
      ]),
    });

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    await waitFor(() => {
      expect(storeState.markStreamLive).toHaveBeenCalledTimes(1);
    });
    expect(storeState.setActiveRun).toHaveBeenCalledWith('run-1', {
      startedAt: '2026-09-23T15:06:00.000Z',
      status: 'running',
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
    setRun({ runId: 'run-pending' });
    setRun({ status: 'idle' });
    storeState.setActiveRun.mockImplementation((id, options) => {
      setRun({ runId: id });
      setRun({ status: options.status });
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

  it.each(
    (['completed', 'failed', 'cancelled'] as const).flatMap((terminal) =>
      ['RUNNING', 'PENDING'].map((status) => ({ terminal, status })),
    ),
  )(
    'does not revive $terminal after delayed $status execution recovery',
    async ({ terminal, status }) => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const apiService = createApiService({
        getActiveWorkflowExecutions: vi.fn(async () => {
          await gate;
          return [{ id: 'run-1', metadata: { threadId: 'thread-1' }, status }];
        }),
      });
      setRun({ runId: 'run-1' });
      setRun({ status: 'running' });
      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );
      await waitFor(() =>
        expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledOnce(),
      );
      setRun({ status: terminal });
      await act(async () => {
        release();
        await gate;
      });
      expect(storeState.setActiveRun).not.toHaveBeenCalled();
      expect(storeState.markStreamLive).not.toHaveBeenCalled();
    },
  );

  it('does not replace a newer owned run with a delayed matching execution', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apiService = createApiService({
      getActiveWorkflowExecutions: vi.fn(async () => {
        await gate;
        return [
          {
            id: 'run-1',
            metadata: { threadId: 'thread-1' },
            status: 'RUNNING',
          },
        ];
      }),
    });
    render(<AgentChatContainer apiService={apiService as never} isStreaming />);
    await waitFor(() =>
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledOnce(),
    );
    setRun({ runId: 'run-new' });
    await act(async () => {
      release();
      await gate;
    });
    expect(storeState.setActiveRun).not.toHaveBeenCalled();
    expect(storeState.markStreamLive).not.toHaveBeenCalled();
  });
  it('reconciles a terminal snapshot run that arrives after the first active execution query', async () => {
    const apiService = createApiService();
    setRun({ runId: null });

    const view = render(
      <AgentChatContainer apiService={apiService as never} isStreaming />,
    );

    await waitFor(() => {
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledTimes(1);
    });
    expect(storeState.clearStaleActiveRun).not.toHaveBeenCalled();

    setRun({ runId: 'run-from-terminal-snapshot' });
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
    setRun({ runId: 'run-stale' });

    render(<AgentChatContainer apiService={apiService as never} isStreaming />);

    await waitFor(() => {
      expect(apiService.getActiveWorkflowExecutions).toHaveBeenCalledTimes(1);
    });
    setRun({ runId: 'run-new' });
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
        undefined,
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
    expect(beginRunHandoff).toHaveBeenCalledWith('thread-1');
    expect(cancelRunHandoff).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-1' }),
    );
    expect(adoptRun).not.toHaveBeenCalled();
  });

  it('does not resurrect input after a failed acknowledgement replays a completed continuation', async () => {
    const request = storeState.pendingInputRequest;
    storeState.clearPendingInputRequest.mockImplementation(() => {
      storeState.pendingInputRequest = null;
    });
    cancelRunHandoff.mockImplementation(() => {
      setRun({ status: 'completed' });
      storeState.pendingInputRequest = null;
    });
    const apiService = createApiService({
      respondToInputRequest: vi
        .fn()
        .mockRejectedValue(new Error('Lost acknowledgement')),
    });
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
    await waitFor(() =>
      expect(cancelRunHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-1' }),
        request,
      ),
    );
    expect(storeState.setPendingInputRequest).not.toHaveBeenCalled();
    expect(storeState.setError).not.toHaveBeenCalledWith(
      'Failed to submit the requested input.',
    );
  });

  it('keeps the URL card as the only onboarding text entry', () => {
    storeState.pendingInputRequest = {
      runId: 'run-url',
      inputRequestId: 'url-request',
      threadId: 'thread-1',
      title: 'Your brand link',
      prompt: 'Share a public link',
      allowFreeText: true,
      options: [],
    };
    const view = render(
      <AgentChatContainer
        apiService={createApiService() as never}
        onboardingMode
        isStreaming
      />,
    );
    expect(
      view.container.querySelector('[data-testid="agent-chat-input-shell"]'),
    ).toBeNull();
  });

  it('pins the stream to the execution that continues an answered input request', async () => {
    const apiService = createApiService({
      respondToInputRequest: vi.fn().mockResolvedValue({
        answer: 'Use the hybrid prompt bar',
        executionId: 'run-answer',
        queuedAt: '2026-09-23T15:10:00.000Z',
        requestId: 'input-1',
        resolvedAt: '2026-09-23T15:10:00.000Z',
        status: 'resolved',
        threadId: 'thread-1',
      }),
      respondToUiAction: vi.fn(),
    });
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];

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
      expect(adoptRun).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-1' }),
        'run-answer',
        '2026-09-23T15:10:00.000Z',
      );
    });
    expect(beginRunHandoff).toHaveBeenCalledWith('thread-1');
    expect(beginRunHandoff.mock.invocationCallOrder[0]).toBeLessThan(
      apiService.respondToInputRequest.mock.invocationCallOrder[0] ?? 0,
    );
    expect(cancelRunHandoff).not.toHaveBeenCalled();
  });

  it('refuses a local CLI send while detection is pending and keeps the draft', async () => {
    const startTurn = vi.fn();
    resetDesktopLocalToolsCache();
    (window as DesktopWindow).genfeedDesktop = {
      agentRuntime: {
        cancelTurn: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        startTurn,
      },
      app: {
        detectLocalTools: vi.fn(() => new Promise(() => undefined)),
      },
    };
    storeState.threads = [{ id: 'thread-1', runtimeKey: 'local/claude-cli' }];
    storeState.pendingInputRequest = null;
    const apiService = createApiService({
      getInstallReadiness: vi.fn().mockResolvedValue(null),
    });

    try {
      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      fireEvent.paste(screen.getByLabelText('Composer paste'), {
        clipboardData: { getData: () => 'Write a launch post' },
      });

      expect(composerSendResults).toEqual([false]);
      expect(storeState.setError).toHaveBeenCalledWith(
        DESKTOP_CLI_RUNTIME_CHECKING_MESSAGE,
      );
      expect(sendStreaming).not.toHaveBeenCalled();
      expect(sendNonStreaming).not.toHaveBeenCalled();
      expect(startTurn).not.toHaveBeenCalled();
    } finally {
      delete (window as DesktopWindow).genfeedDesktop;
      resetDesktopLocalToolsCache();
    }
  });

  it('never sends a thread bound to an outdated local Codex CLI to the hosted runtime', async () => {
    const upgradeCommand = 'npm install -g @openai/codex@latest';
    const startTurn = vi.fn();
    resetDesktopLocalToolsCache();
    (window as DesktopWindow).genfeedDesktop = {
      agentRuntime: {
        cancelTurn: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        startTurn,
      },
      app: {
        detectLocalTools: vi.fn().mockResolvedValue({
          anyDetected: true,
          claude: true,
          codex: false,
          detected: ['claude'],
          grok: false,
          upgradesRequired: [
            {
              key: 'codex',
              message: `This Codex CLI is too old to run Genfeed agent turns. Update it with \`${upgradeCommand}\`, then restart Genfeed Desktop.`,
            },
          ],
        }),
      },
    };
    storeState.threads = [{ id: 'thread-1', runtimeKey: 'local/codex-cli' }];
    storeState.pendingInputRequest = null;
    const apiService = createApiService({
      getInstallReadiness: vi.fn().mockResolvedValue(null),
    });

    try {
      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      expect(
        await screen.findByTestId('agent-desktop-runtime-notice'),
      ).toHaveTextContent(upgradeCommand);

      fireEvent.paste(screen.getByLabelText('Composer paste'), {
        clipboardData: { getData: () => 'Write a launch post' },
      });

      expect(composerSendResults).toEqual([false]);
      expect(storeState.setError).toHaveBeenCalledWith(
        expect.stringContaining(upgradeCommand),
      );
      expect(sendStreaming).not.toHaveBeenCalled();
      expect(sendNonStreaming).not.toHaveBeenCalled();
      expect(startTurn).not.toHaveBeenCalled();
    } finally {
      delete (window as DesktopWindow).genfeedDesktop;
      resetDesktopLocalToolsCache();
    }
  });

  describe('a thread bound to a local CLI in the plain web app', () => {
    beforeEach(() => {
      delete (window as DesktopWindow).genfeedDesktop;
      resetDesktopLocalToolsCache();
      storeState.threads = [{ id: 'thread-1', runtimeKey: 'local/claude-cli' }];
      storeState.pendingInputRequest = null;
    });

    it('blocks the send, keeps the draft and never reaches the hosted stream', () => {
      const apiService = createApiService();

      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      expect(
        screen.getByTestId('agent-web-local-cli-notice'),
      ).toHaveTextContent('title');

      fireEvent.paste(screen.getByLabelText('Composer paste'), {
        clipboardData: { getData: () => 'Write a launch post' },
      });

      // `false` tells the composer to keep the draft.
      expect(composerSendResults).toEqual([false]);
      expect(storeState.setError).toHaveBeenCalledWith('webBlocked');
      expect(sendStreaming).not.toHaveBeenCalled();
      expect(sendNonStreaming).not.toHaveBeenCalled();
    });

    it('offers to open the thread in Desktop', () => {
      const apiService = createApiService();

      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      expect(
        screen.getByRole('link', { name: 'openInDesktop' }),
      ).toHaveAttribute('href', 'genfeedai-desktop://thread/thread-1');
    });

    it('switches the thread to the hosted runtime through the runtime selection path', () => {
      const apiService = createApiService({
        updateThread: vi.fn().mockResolvedValue({}),
      });

      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      fireEvent.click(screen.getByText('switchToHosted'));

      expect(storeState.updateThread).toHaveBeenCalledWith('thread-1', {
        requestedModel: undefined,
        runtimeKey: 'hosted/genfeed',
      });
      expect(apiService.updateThread).toHaveBeenCalledWith(
        'thread-1',
        { requestedModel: '', runtimeKey: 'hosted/genfeed' },
        expect.any(AbortSignal),
      );
    });

    it('lets the thread send once it is bound to a hosted runtime', () => {
      storeState.threads = [{ id: 'thread-1', runtimeKey: 'hosted/genfeed' }];
      const apiService = createApiService();

      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      expect(
        screen.queryByTestId('agent-web-local-cli-notice'),
      ).not.toBeInTheDocument();

      fireEvent.paste(screen.getByLabelText('Composer paste'), {
        clipboardData: { getData: () => 'Write a launch post' },
      });

      expect(composerSendResults).toEqual([true]);
      expect(sendStreaming).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the Desktop runtime bar, not the web notice, for a CLI thread in Desktop', async () => {
    resetDesktopLocalToolsCache();
    (window as DesktopWindow).genfeedDesktop = {
      agentRuntime: {
        cancelTurn: vi.fn(),
        onEvent: vi.fn(() => () => undefined),
        startTurn: vi.fn(),
      },
      app: {
        detectLocalTools: vi.fn().mockResolvedValue({
          anyDetected: true,
          claude: true,
          codex: false,
          detected: ['claude'],
          grok: false,
        }),
      },
    };
    storeState.threads = [{ id: 'thread-1', runtimeKey: 'local/claude-cli' }];
    storeState.pendingInputRequest = null;
    const apiService = createApiService({
      getInstallReadiness: vi.fn().mockResolvedValue(null),
    });

    try {
      render(
        <AgentChatContainer apiService={apiService as never} isStreaming />,
      );

      expect(
        await screen.findByTestId('agent-desktop-runtime-bar'),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('agent-web-local-cli-notice'),
      ).not.toBeInTheDocument();
    } finally {
      delete (window as DesktopWindow).genfeedDesktop;
      resetDesktopLocalToolsCache();
    }
  });

  it('resolves a pasted URL on the same turn while the agent is waiting for input', async () => {
    let resolveAnswer: (() => void) | undefined;
    const apiService = createApiService({
      respondToInputRequest: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveAnswer = resolve;
          }),
      ),
    });
    setRun({ status: 'awaiting_input' });
    storeState.stream.isStreaming = true;
    storeState.pendingInputRequest = {
      allowFreeText: true,
      inputRequestId: 'source-ask',
      options: [],
      prompt: 'Paste a YouTube URL',
      runId: 'run-1',
      threadId: 'thread-1',
      title: 'Source',
    };
    render(<AgentChatContainer apiService={apiService as never} isStreaming />);
    const composer = screen.getByLabelText('Composer paste');
    expect(composer).toHaveAttribute('placeholder', 'Paste a YouTube URL');
    fireEvent.paste(composer, {
      clipboardData: { getData: () => 'https://www.youtube.com/watch?v=demo' },
    });
    expect(storeState.clearPendingInputRequest).toHaveBeenCalledTimes(1);
    expect(apiService.respondToInputRequest).toHaveBeenCalledWith(
      'thread-1',
      'source-ask',
      'https://www.youtube.com/watch?v=demo',
      undefined,
      expect.any(Object),
      undefined,
    );
    expect(sendStreaming).not.toHaveBeenCalled();
    await act(async () => resolveAnswer?.());
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
        placement="dock"
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
    expect(portaled?.getAttribute('data-show-top-fade')).toBe('false');
    expect(screen.getByTestId('chat-input')).toHaveAttribute(
      'data-density',
      'dock',
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

  it('renders the shared greeting immediately during kickoff and reconciles once', () => {
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    const apiService = createApiService();
    const { rerender } = render(
      <AgentChatContainer
        apiService={apiService as never}
        onboardingMode
        isLoadingThread
      />,
    );
    expect(screen.getAllByText(ONBOARDING_GREETING)).toHaveLength(1);
    storeState.messages = [
      buildAssistantMessage({ content: ONBOARDING_GREETING }),
    ];
    rerender(
      <AgentChatContainer apiService={apiService as never} onboardingMode />,
    );
    expect(screen.getAllByText(ONBOARDING_GREETING)).toHaveLength(1);
  });

  it('hides the onboarding composer for a button-only pending request', () => {
    if (storeState.pendingInputRequest)
      storeState.pendingInputRequest.allowFreeText = false;
    render(
      <AgentChatContainer
        apiService={createApiService() as never}
        onboardingMode
      />,
    );
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit requested input' }),
    ).toBeInTheDocument();
  });

  it('keeps the URL card and hides the separate onboarding composer', () => {
    render(
      <AgentChatContainer
        apiService={createApiService() as never}
        onboardingMode
      />,
    );
    expect(screen.queryByTestId('chat-input')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Submit requested input' }),
    ).toBeInTheDocument();
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

    expect(pinConversationScrollToBottomMock).not.toHaveBeenCalled();

    storeState.messages = [buildAssistantMessage()];

    rerender(<AgentChatContainer apiService={apiService as never} />);

    expect(pinConversationScrollToBottomMock).toHaveBeenCalled();
  });

  it('pins a switched thread once the transcript belongs to that thread', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage({ threadId: 'thread-1' })];

    const { rerender } = render(
      <AgentChatContainer apiService={apiService as never} />,
    );

    pinConversationScrollToBottomMock.mockClear();

    storeState.activeThreadId = 'thread-2';
    rerender(<AgentChatContainer apiService={apiService as never} />);

    expect(pinConversationScrollToBottomMock).not.toHaveBeenCalled();

    storeState.messages = [
      buildAssistantMessage({ id: 'm-2', threadId: 'thread-2' }),
    ];
    rerender(<AgentChatContainer apiService={apiService as never} />);

    expect(pinConversationScrollToBottomMock).toHaveBeenCalled();
  });

  it('keeps the same composer mounted while scrolling a settled thread', () => {
    const apiService = createApiService();
    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    const view = render(
      <AgentChatContainer apiService={apiService as never} />,
    );
    const composer = screen.getByTestId('chat-input');
    const scrollContainer = view.container.querySelector('.overflow-y-auto');
    if (!(scrollContainer instanceof HTMLDivElement)) {
      throw new Error('Conversation scroll container not found');
    }
    Object.defineProperties(scrollContainer, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    scrollContainer.scrollTop = 100;
    fireEvent.scroll(scrollContainer);
    expect(screen.getByTestId('chat-input')).toBe(composer);
    expect(screen.getByLabelText('Composer paste')).toBeInTheDocument();

    scrollContainer.scrollTop = 500;
    fireEvent.scroll(scrollContainer);
    expect(screen.getByTestId('chat-input')).toBe(composer);
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

  it('renders contextual suggested actions through the shared prompt bar suggestions UI, including a plan-mode shortcut (#4672 — Plan is reachable via the mode dropdown)', () => {
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

  it('notifies the shell when a prompt is sent so a collapsed transcript can open', () => {
    storeState.pendingInputRequest = null;
    storeState.messages = [];
    const onSendMessage = vi.fn();
    render(
      <ConversationComposerShellProvider
        contextLabel="Library"
        draftScopeKey="library"
        portalTarget={null}
        shellState="canvas"
        onSendMessage={onSendMessage}
      >
        <AgentChatContainer
          apiService={createApiService() as never}
          suggestedActions={[
            {
              id: 'reprompt',
              label: 'Reprompt',
              prompt: 'Make the apple green',
            },
          ]}
        />
      </ConversationComposerShellProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reprompt' }));
    expect(onSendMessage).toHaveBeenCalledOnce();
    expect(sendNonStreaming).toHaveBeenCalled();
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
      agentMode: AgentThreadMode.MANUAL,
    });
  });

  it('queues a suggestion while a turn is in flight', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    setRun({ isGenerating: true });

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

  it('queues a send while a restored run is active even though no stream is live', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    setRun({ runId: 'run-1' });
    setRun({ status: 'running' });

    render(
      <AgentChatContainer
        apiService={apiService as never}
        isStreaming
        suggestedActions={[
          { id: 'status', label: 'Status', prompt: 'status?' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Status' }));

    expect(sendStreaming).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-follow-up-queue')).toHaveTextContent(
      'status?',
    );
  });

  it('queues a rapid second send after the first send marks the live transport busy', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [];
    setRun({ isGenerating: false });
    sendNonStreaming.mockImplementationOnce(() => {
      setRun({ isGenerating: true });
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
    setRun({ isGenerating: true });
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
    setRun({ isGenerating: true });

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

    setRun({ isGenerating: false });
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
    setRun({ isGenerating: true });

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
    setRun({ isGenerating: false });
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
    setRun({ isGenerating: true });
    setRun({ runId: 'run-1' });
    setRun({ status: 'running' });

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

    setRun({ isGenerating: false });
    setRun({ status: 'cancelled' });
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
    setRun({ runId: 'run-1' });
    setRun({ status: 'running' });

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
    setRun({ isGenerating: true });
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
    setRun({ isGenerating: true });
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
    setRun({ isGenerating: true });

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

    setRun({ isGenerating: false });
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
    setRun({ isGenerating: true });

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

    setRun({ isGenerating: false });
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
        toolName: 'generate',
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
        expect.objectContaining({ agentMode: AgentThreadMode.MANUAL }),
      );
    });
    await waitFor(() => {
      expect(pinConversationScrollToBottomMock).toHaveBeenCalledWith(
        expect.anything(),
        'smooth',
      );
    });
  });

  it('sends the plan-mode suggestion shortcut like any other suggested prompt (#4672 — Plan is reachable via the mode dropdown, not a filtered shortcut)', () => {
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

    expect(sendNonStreaming).toHaveBeenCalledWith(
      'Use plan mode in this thread',
      {
        attachments: undefined,
        agentMode: AgentThreadMode.MANUAL,
      },
    );
  });

  it('renders the composer alongside a non-empty conversation when suggested actions are provided', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.messages = [buildAssistantMessage()];
    setRun({ status: 'running' });

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
    setRun({ status: 'running' });
    setRun({ startedAt: new Date(Date.now() - 5_000).toISOString() });
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

  it('locks the plan controls while an approval of that plan is still running', () => {
    const apiService = createApiService();

    storeState.pendingInputRequest = null;
    storeState.latestProposedPlan = {
      content: '1. Add a toggle\n2. Pause after planning',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    // The request's in-flight lock is released at the ack, but the run
    // executing the plan is still pending on the thread.
    storeState.uiActionStatesByThread = {
      'thread-1': {
        'approve_plan:plan-1': {
          action: 'approve_plan',
          runId: 'exec-plan-1',
          sequence: 4,
          sourceId: 'plan-1',
          status: 'pending',
          updatedAt: '2026-03-26T10:00:00.000Z',
        },
      },
    };

    render(<AgentChatContainer apiService={apiService as never} />);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Request changes' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(apiService.respondToUiAction).not.toHaveBeenCalled();
  });

  it('adopts a run whose ack lands after its thread was left and shown again', async () => {
    let resolveAck: (ack: {
      executionId: string;
      status: 'queued';
      threadId: string;
    }) => void = () => undefined;
    const uiActionApi = createUiActionApi();
    const apiService = createApiService({
      ...uiActionApi,
      respondToUiAction: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveAck = resolve;
          }),
      ),
    });
    storeState.pendingInputRequest = null;
    storeState.threads = [{ brandId: null, contextVersion: 1, id: 'thread-1' }];
    storeState.latestProposedPlan = {
      content: '1. Add a toggle\n2. Pause after planning',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'plan-1',
      status: 'awaiting_approval',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
    const view = render(
      <AgentChatContainer apiService={apiService as never} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(apiService.respondToUiAction).toHaveBeenCalledTimes(1),
    );
    expect(beginRunHandoff).toHaveBeenCalledWith('thread-1');

    // Leave the thread and come back before the ack arrives.
    storeState.activeThreadId = 'thread-2';
    view.rerender(<AgentChatContainer apiService={apiService as never} />);
    storeState.activeThreadId = 'thread-1';
    view.rerender(<AgentChatContainer apiService={apiService as never} />);

    await act(async () => {
      resolveAck({
        executionId: 'exec-ui-action',
        status: 'queued',
        threadId: 'thread-1',
      });
    });

    expect(storeState.trackUiActionRun).toHaveBeenCalledWith('thread-1', {
      action: 'approve_plan',
      runId: 'exec-ui-action',
      sourceId: 'plan-1',
    });
    expect(adoptRun).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: 'thread-1' }),
      'exec-ui-action',
      null,
      { requireRunId: true },
    );
    expect(uiActionApi.getMessages).not.toHaveBeenCalled();
    expect(uiActionApi.getWorkflowExecution).not.toHaveBeenCalled();
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
    const apiService = createApiService(createUiActionApi());

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
    // The run is adopted into the thread stream; its reply arrives there.
    await waitFor(() =>
      expect(adoptRun).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-1' }),
        'exec-ui-action',
        null,
        { requireRunId: true },
      ),
    );
    expect(storeState.addMessage).not.toHaveBeenCalled();
    expect(apiService.getMessages).not.toHaveBeenCalled();
  });

  it('ignores a duplicate UI action while the first request is pending', async () => {
    let resolveAction: ((value: Record<string, unknown>) => void) | undefined;
    const pendingAction = new Promise<Record<string, unknown>>((resolve) => {
      resolveAction = resolve;
    });
    const respondToUiAction = vi.fn(() => pendingAction);
    const apiService = createApiService({
      ...createUiActionApi(),
      respondToUiAction,
    });

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
      executionId: 'exec-ui-action',
      status: 'queued',
      threadId: 'thread-1',
    });

    await waitFor(() => expect(adoptRun).toHaveBeenCalledTimes(1));
  });

  it('submits a brand confirmation and adopts its run without reading the thread back', async () => {
    // The ack carries no scope; the confirmed brand arrives with the run's
    // own `agent:done` (see agent-chat-stream.subscriptions.spec).
    const apiService = createApiService(createUiActionApi());

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
    await waitFor(() =>
      expect(adoptRun).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: 'thread-1' }),
        'exec-ui-action',
        null,
        { requireRunId: true },
      ),
    );
    expect(storeState.upsertThread).not.toHaveBeenCalled();
  });

  it('renders the provided empty-state title and description', () => {
    storeState.messages = [];
    storeState.error = null;
    setRun({ isGenerating: false });
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

  it('docks the empty-state composer into the dock slot', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:thread-1:3"
        placement="dock"
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

  it('keeps an empty conversation composer in an overlay slot', () => {
    const apiService = createApiService();
    const portalTarget = document.createElement('div');
    document.body.append(portalTarget);

    storeState.pendingInputRequest = null;
    storeState.messages = [];

    const { container } = render(
      <ConversationComposerShellProvider
        contextLabel="Workspace"
        draftScopeKey="acme:new:0"
        placement="overlay"
        portalTarget={portalTarget}
        shellState="overlay"
      >
        <AgentChatContainer
          apiService={apiService as never}
          emptyStateTitle="Start a conversation"
        />
      </ConversationComposerShellProvider>,
    );

    expect(
      container.querySelector('[data-testid="agent-chat-input-shell"]'),
    ).toBeNull();
    expect(
      portalTarget.querySelector('[data-layout-mode="inflow"]'),
    ).not.toBeNull();

    portalTarget.remove();
  });
});
