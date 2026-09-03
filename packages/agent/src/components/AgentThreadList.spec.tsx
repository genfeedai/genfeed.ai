import { AgentThreadList } from '@genfeedai/agent/components/AgentThreadList';
import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MouseEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prefetchRoute } = vi.hoisted(() => ({
  prefetchRoute: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    prefetch: prefetchRoute,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: function MockLink(props: {
    children?: ReactNode;
    href: string;
    onBlur?: () => void;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
    onFocus?: () => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
    prefetch?: boolean;
    className?: string;
  }) {
    return (
      <a
        className={props.className}
        data-prefetch={String(props.prefetch)}
        href={props.href}
        onBlur={props.onBlur}
        onClick={props.onClick}
        onFocus={props.onFocus}
        onPointerEnter={props.onPointerEnter}
        onPointerLeave={props.onPointerLeave}
      >
        {props.children}
      </a>
    );
  },
}));

vi.mock('next/image', () => ({
  default: function MockImage(props: { alt?: string; src?: string }) {
    return <img alt={props.alt} src={props.src} />;
  },
}));

vi.mock('@helpers/formatting/cn/cn.util', () => ({
  cn: (...classes: Array<string | false | null | undefined>) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    onClick?: () => void | Promise<void>;
  }) {
    return (
      <button
        type="button"
        aria-label={props.ariaLabel}
        className={props.className}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    );
  },
}));

interface AgentChatStoreState {
  activeRunId: string | null;
  activeRunStatus:
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled';
  activeThreadId: string | null;
  cacheConversation: ReturnType<typeof vi.fn>;
  clearConversationCache: ReturnType<typeof vi.fn>;
  clearThreadAttention: ReturnType<typeof vi.fn>;
  clearMessages: ReturnType<typeof vi.fn>;
  composerSeed: {
    content: string;
    nonce: number;
    threadId: string | null;
  } | null;
  draftPlanModeEnabled: boolean;
  isConversationCacheFresh: ReturnType<typeof vi.fn>;
  latestProposedPlan: Record<string, unknown> | null;
  messages: Array<Record<string, unknown>>;
  pendingInputRequest: Record<string, unknown> | null;
  primeConversationCache: ReturnType<typeof vi.fn>;
  resetActiveConversationState: ReturnType<typeof vi.fn>;
  resetStreamState: ReturnType<typeof vi.fn>;
  restoreCachedConversation: ReturnType<typeof vi.fn>;
  runStartedAt: string | null;
  stream: {
    activeToolCalls: unknown[];
    isStreaming: boolean;
    pendingUiActions: unknown[];
    streamingContent: string;
    streamingReasoning: string;
  };
  threadUiBusyById: Record<string, boolean>;
  threads: AgentThread[];
  setActiveRun: ReturnType<typeof vi.fn>;
  setActiveThread: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  setMessages: ReturnType<typeof vi.fn>;
  setThreadPrompt: ReturnType<typeof vi.fn>;
  setThreads: ReturnType<typeof vi.fn>;
  setThreadUiBusy: ReturnType<typeof vi.fn>;
  setWorkEvents: ReturnType<typeof vi.fn>;
  workEvents: Array<Record<string, unknown>>;
}

const storeState: AgentChatStoreState = {
  activeRunId: null,
  activeRunStatus: 'idle',
  activeThreadId: null,
  cacheConversation: vi.fn(),
  clearConversationCache: vi.fn(),
  clearMessages: vi.fn(),
  clearThreadAttention: vi.fn(),
  composerSeed: null,
  draftPlanModeEnabled: false,
  isConversationCacheFresh: vi.fn(() => false),
  latestProposedPlan: null,
  messages: [],
  pendingInputRequest: null,
  primeConversationCache: vi.fn(),
  resetActiveConversationState: vi.fn(() => {
    storeState.activeRunId = null;
    storeState.activeRunStatus = 'idle';
    storeState.composerSeed = null;
    storeState.draftPlanModeEnabled = false;
    storeState.latestProposedPlan = null;
    storeState.messages = [];
    storeState.pendingInputRequest = null;
    storeState.runStartedAt = null;
    storeState.stream = {
      activeToolCalls: [],
      isStreaming: false,
      pendingUiActions: [],
      streamingContent: '',
      streamingReasoning: '',
    };
    storeState.threadUiBusyById = {};
    storeState.workEvents = [];
  }),
  resetStreamState: vi.fn(),
  restoreCachedConversation: vi.fn(() => false),
  runStartedAt: null,
  setActiveRun: vi.fn(),
  setActiveThread: vi.fn((threadId: string | null) => {
    storeState.activeThreadId = threadId;
  }),
  setError: vi.fn(),
  setMessages: vi.fn(),
  setThreadPrompt: vi.fn(),
  setThreads: vi.fn((threads: AgentThread[]) => {
    storeState.threads = threads;
  }),
  setThreadUiBusy: vi.fn(),
  setWorkEvents: vi.fn(),
  stream: {
    activeToolCalls: [],
    isStreaming: false,
    pendingUiActions: [],
    streamingContent: '',
    streamingReasoning: '',
  },
  threads: [],
  threadUiBusyById: {},
  workEvents: [],
};

vi.mock('../stores/agent-chat.store', () => ({
  useAgentChatStore: Object.assign(
    (selector: (state: AgentChatStoreState) => unknown) => selector(storeState),
    {
      getState: () => storeState,
    },
  ),
}));

function createThread(
  id: string,
  title: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-03-08T12:00:00.000Z',
    id,
    isPinned: false,
    status: 'active' as never,
    title,
    updatedAt: '2026-03-08T12:00:00.000Z',
    ...overrides,
  };
}

function createApiService(overrides: Record<string, unknown> = {}) {
  return {
    archiveAllThreads: vi.fn(),
    archiveThread: vi.fn(),
    branchThread: vi.fn(),
    getMessages: vi.fn(),
    getThread: vi.fn(),
    getThreads: vi.fn().mockResolvedValue([]),
    pinThread: vi.fn(),
    unarchiveThread: vi.fn(),
    unpinThread: vi.fn(),
    updateThread: vi.fn(),
    ...overrides,
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  reject: (reason: Error) => void;
  resolve: (value: T) => void;
} {
  let reject: ((reason: Error) => void) | null = null;
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });

  return {
    promise,
    reject: (reason) => reject?.(reason),
    resolve: (value) => resolve?.(value),
  };
}

describe('AgentThreadList', () => {
  beforeEach(() => {
    prefetchRoute.mockReset();
    storeState.activeRunId = null;
    storeState.activeRunStatus = 'idle';
    storeState.activeThreadId = null;
    storeState.composerSeed = null;
    storeState.draftPlanModeEnabled = false;
    storeState.latestProposedPlan = null;
    storeState.messages = [];
    storeState.pendingInputRequest = null;
    storeState.runStartedAt = null;
    storeState.threads = [];
    storeState.clearMessages.mockReset();
    storeState.clearThreadAttention.mockReset();
    storeState.resetActiveConversationState.mockClear();
    storeState.resetStreamState.mockReset();
    storeState.setActiveRun.mockReset();
    storeState.setActiveThread.mockClear();
    storeState.setThreadPrompt.mockReset();
    storeState.setThreads.mockClear();
    storeState.setThreadUiBusy.mockReset();
    storeState.setError.mockReset();
    storeState.setMessages.mockReset();
    storeState.setWorkEvents.mockReset();
    storeState.stream = {
      activeToolCalls: [],
      isStreaming: false,
      pendingUiActions: [],
      streamingContent: '',
      streamingReasoning: '',
    };
    storeState.threadUiBusyById = {};
    storeState.workEvents = [];
  });

  it('shows a load failure state instead of the empty state on fetch errors', async () => {
    const apiService = createApiService({
      getThreads: vi.fn().mockRejectedValue(new Error('Network down')),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        resolveThreadHref={(candidate) =>
          `/acme/moonrise/agent/${candidate.id}`
        }
      />,
    );

    expect(
      await screen.findByText('Failed to load threads'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('No threads')).toBeNull();
  });

  it('shows the true empty state after a successful empty fetch', async () => {
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([]),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('No threads')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load threads')).toBeNull();
  });

  it('retries loading when the retry button is pressed', async () => {
    const apiService = createApiService({
      getThreads: vi
        .fn()
        .mockRejectedValueOnce(new Error('Network down'))
        .mockResolvedValueOnce([createThread('conv-1', 'Recovered')]),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByText('Recovered')).toBeInTheDocument();
    });
    expect(screen.queryByText('Failed to load threads')).toBeNull();
  });

  it('toggles to archived threads and updates the heading', async () => {
    const activeThread = createThread('conv-1', 'Recent thread');
    const archivedThread = {
      ...createThread('conv-2', 'Archived thread'),
      status: 'archived' as never,
    };
    const apiService = createApiService({
      getThreads: vi
        .fn()
        .mockResolvedValueOnce([activeThread])
        .mockResolvedValueOnce([archivedThread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Recent thread')).toBeInTheDocument();

    // Radix opens a dropdown trigger on pointerdown, not click.
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archived' }));

    await waitFor(() => {
      expect(screen.getByText('Archived thread')).toBeInTheDocument();
    });

    const archivedTitle = screen.getByText('Archived thread');
    const archivedRow = archivedTitle.closest('[data-archived="true"]');

    expect(archivedRow).toHaveClass('bg-muted/50');
    expect(archivedRow).not.toHaveClass('opacity-40');
    expect(archivedTitle).toHaveClass('text-foreground/65');

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Recent' }),
    ).toBeInTheDocument();
    expect(apiService.getThreads).toHaveBeenNthCalledWith(
      2,
      { limit: 50, status: 'archived' },
      expect.any(AbortSignal),
    );
  });

  it('refetches conversations from the header Refresh action', async () => {
    const thread = createThread('conv-1', 'Refresh me');
    const apiService = createApiService({
      getThreads: vi
        .fn()
        .mockResolvedValueOnce([thread])
        .mockResolvedValueOnce([
          createThread('conv-1', 'Refresh me'),
          createThread('conv-2', 'Appeared after refresh'),
        ]),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Refresh me')).toBeInTheDocument();
    expect(apiService.getThreads).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Refresh' }));

    expect(
      await screen.findByText('Appeared after refresh'),
    ).toBeInTheDocument();
    expect(apiService.getThreads).toHaveBeenCalledTimes(2);
  });

  it('archives a thread from the row action and removes it from the list', async () => {
    const thread = createThread('conv-1', 'Needs archive');
    const apiService = createApiService({
      archiveThread: vi.fn().mockResolvedValue({
        ...thread,
        status: 'archived',
      }),
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Needs archive')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Needs archive'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Archive/i }));

    await waitFor(() => {
      expect(storeState.threads).toEqual([]);
    });

    expect(apiService.archiveThread).toHaveBeenCalledWith('conv-1');
  });

  it('renders each thread title as a link to its route', async () => {
    const thread = createThread('conv-1', 'Linked thread');
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    await screen.findByText('Linked thread');

    const threadLink = screen.getByText('Linked thread').closest('a');

    expect(threadLink).toHaveAttribute('href', '/agent/conv-1');
    // Row chrome is flex min-h-0 stretch (not a fixed min-h-14 pill).
    expect(threadLink?.parentElement).toHaveClass('min-h-0');
  });

  it('keeps programmatic thread navigation route-driven and prefetches on intent', async () => {
    const thread = createThread('conv-1', 'Fast thread');
    const onNavigate = vi.fn();
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        onNavigate={onNavigate}
        resolveThreadHref={(candidate) =>
          `/acme/moonrise/agent/${candidate.id}`
        }
      />,
    );

    const threadLink = (await screen.findByText('Fast thread')).closest('a');

    expect(threadLink).not.toBeNull();
    expect(threadLink).toHaveAttribute('data-prefetch', 'false');

    fireEvent.pointerEnter(threadLink as HTMLAnchorElement);
    expect(prefetchRoute).toHaveBeenCalledOnce();
    expect(prefetchRoute).toHaveBeenCalledWith('/acme/moonrise/agent/conv-1');

    const navigationWasNotCanceled = fireEvent.click(
      threadLink as HTMLAnchorElement,
    );

    expect(navigationWasNotCanceled).toBe(false);
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('/acme/moonrise/agent/conv-1');
    expect(storeState.setActiveThread).not.toHaveBeenCalled();
    expect(apiService.getMessages).not.toHaveBeenCalled();
  });

  it('uses one trailing slot for the timestamp and thread actions', async () => {
    const tenDaysAgo = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const thread = createThread('conv-1', 'Aligned thread', {
      lastActivityAt: tenDaysAgo,
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    const timestamp = await screen.findByText('10d');
    const actions = screen.getByRole('button', {
      name: 'Thread actions for Aligned thread',
    });

    expect(timestamp.parentElement).toBe(actions.parentElement);
    expect(timestamp).toHaveClass(
      'group-hover:opacity-0',
      'group-focus-within:opacity-0',
      '[@media(hover:none)]:opacity-0',
    );
    expect(actions).toHaveClass(
      'opacity-0',
      'group-hover:opacity-100',
      'group-focus-within:opacity-100',
      '[@media(hover:none)]:opacity-100',
    );

    fireEvent.pointerDown(actions);

    expect(
      await screen.findByRole('menuitem', { name: 'Pin conversation' }),
    ).toBeInTheDocument();
    expect(timestamp).toHaveClass('opacity-0');
    expect(actions).toHaveClass('opacity-100');
  });

  it('does not render malformed threads without usable ids', async () => {
    const malformedThread = {
      ...createThread('conv-bad', 'Malformed thread'),
      id: undefined as unknown as string,
    };
    const validThread = createThread('conv-1', 'Valid thread');
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([malformedThread, validThread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Valid thread')).toBeInTheDocument();
    expect(screen.queryByText('Malformed thread')).toBeNull();
    expect(document.querySelector('a[href="/agent/undefined"]')).toBeNull();
  });

  it('clears the active thread and navigates away when archived', async () => {
    const thread = createThread('conv-1', 'Current chat');
    storeState.activeThreadId = 'conv-1';
    const onNavigate = vi.fn();
    const apiService = createApiService({
      archiveThread: vi.fn().mockResolvedValue({
        ...thread,
        status: 'archived',
      }),
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByText('Current chat')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Current chat'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Archive/i }));

    await waitFor(() => {
      expect(storeState.clearMessages).toHaveBeenCalled();
    });

    expect(onNavigate).toHaveBeenCalledWith('/agent/new');
  });

  it('restores an archived thread from the archived view', async () => {
    const archivedThread = {
      ...createThread('conv-1', 'Restore me'),
      status: 'archived' as never,
    };
    const apiService = createApiService({
      getThreads: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([archivedThread]),
      unarchiveThread: vi.fn().mockResolvedValue({
        ...archivedThread,
        status: 'active',
      }),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('No threads')).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archived' }));

    expect(await screen.findByText('Restore me')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Restore me'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Restore/i }));

    await waitFor(() => {
      expect(storeState.threads).toEqual([]);
    });

    expect(apiService.unarchiveThread).toHaveBeenCalledWith('conv-1');
  });

  it('forks a thread from the thread actions menu and navigates to the new thread', async () => {
    const thread = createThread('conv-1', 'Fork me');
    const branchedThread = createThread('conv-2', 'Fork me copy');
    const onNavigate = vi.fn();
    const apiService = createApiService({
      branchThread: vi.fn().mockResolvedValue(branchedThread),
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByText('Fork me')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Fork me'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Fork thread/i }),
    );

    await waitFor(() => {
      expect(apiService.branchThread).toHaveBeenCalledWith('conv-1');
    });

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith('/agent/conv-2');
    });

    expect(storeState.threads[0]?.id).toBe('conv-2');
  });

  it('renames a thread from the thread actions menu', async () => {
    const thread = createThread('conv-1', 'Rename me');
    const renamedThread = { ...thread, title: 'Renamed thread' };
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
      updateThread: vi.fn().mockResolvedValue(renamedThread),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Rename me')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Rename me'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Rename/i }));

    const renameInput = screen.getByRole('textbox', {
      name: 'Rename Rename me',
    });
    expect(renameInput).toHaveFocus();

    fireEvent.change(renameInput, { target: { value: 'Renamed thread' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });

    await waitFor(() => {
      expect(apiService.updateThread).toHaveBeenCalledWith('conv-1', {
        title: 'Renamed thread',
      });
    });

    expect(storeState.threads[0]?.title).toBe('Renamed thread');
  });

  it('renders compact context previews without an avatar or thumbnail column', async () => {
    const thread = createThread('conv-1', 'Compact row', {
      lastAssistantPreview: 'Three portraits are ready',
      lastGeneratedAssetUrl: 'https://cdn.test/portrait.png',
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Compact row')).toBeInTheDocument();
    expect(screen.getByText('Three portraits are ready')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', {
        name: 'Latest generated output for Compact row',
      }),
    ).toBeNull();
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('groups org-scope conversations by brand instead of activity sections', async () => {
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([
        createThread('curie-1', 'Curie shoot', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
        }),
        createThread('pascal-1', 'Pascal cutdown', {
          brandId: 'brand-pascal',
          brandLabel: 'Pascal',
        }),
      ]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Curie shoot')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Curie' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pascal' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recent' })).toBeNull();
  });

  it('keeps activity sections when a brand is selected', async () => {
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([
        createThread('curie-1', 'Curie shoot', {
          brandId: 'brand-curie',
          brandLabel: 'Curie',
        }),
      ]),
      unarchiveThread: vi.fn(),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        brandId="brand-curie"
      />,
    );

    expect(await screen.findByText('Curie shoot')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Curie' })).toBeNull();
  });

  it('uses an accessible status dot for threads that need input', async () => {
    const thread = createThread('conv-1', 'Needs your reply', {
      pendingInputCount: 1,
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    const status = await screen.findByRole('status', { name: 'Needs input' });

    expect(status).toHaveClass('rounded-full', 'size-2', 'bg-warning');
    expect(status.querySelector('svg')).not.toBeInTheDocument();
  });

  it('does not hide the status meaning behind a focus-only tooltip', async () => {
    const thread = createThread('conv-1', 'Needs keyboard help', {
      pendingInputCount: 1,
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    const statusIndicator = await screen.findByRole('status', {
      name: 'Needs input',
    });

    expect(statusIndicator).toHaveAccessibleName('Needs input');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('pins a conversation and moves it to the top of the list', async () => {
    const firstThread = createThread('conv-1', 'Later thread');
    const secondThread = {
      ...createThread('conv-2', 'Pinned thread'),
      updatedAt: '2026-03-08T11:00:00.000Z',
    };
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([firstThread, secondThread]),
      pinThread: vi.fn().mockResolvedValue({ ...secondThread, isPinned: true }),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Later thread')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Pinned thread'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: /Pin conversation/i }),
    );

    await waitFor(() => {
      expect(apiService.pinThread).toHaveBeenCalledWith('conv-2');
    });

    expect(storeState.threads[0]?.id).toBe('conv-2');
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Archive all' }),
    ).toBeInTheDocument();
  });

  it('renders pinned conversations in their own prioritized section', async () => {
    const pinnedThread = {
      ...createThread('conv-2', 'Pinned thread', {
        brandId: 'brand-1',
      }),
      isPinned: true,
      updatedAt: '2026-03-08T11:00:00.000Z',
    };
    const regularThread = createThread('conv-1', 'Later thread', {
      brandId: 'brand-1',
    });
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([regularThread, pinnedThread]),
      pinThread: vi.fn(),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(
      <AgentThreadList apiService={apiService as never} brandId="brand-1" />,
    );

    const pinnedSection = await screen.findByRole('region', {
      name: 'Pinned',
    });

    expect(pinnedSection).toHaveAccessibleName('Pinned');
    expect(pinnedSection).toHaveTextContent('Pinned thread');
    expect(pinnedSection).not.toHaveTextContent('Later thread');
  });

  it('does not add an extra horizontal gutter around the thread rows', async () => {
    const thread = createThread('conv-1', 'Same width thread');
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([thread]),
      pinThread: vi.fn(),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Same width thread')).toBeInTheDocument();
    expect(screen.getByTestId('agent-thread-list-content')).not.toHaveClass(
      'px-2',
    );
  });

  it('uses the shared thin sidebar scrollbar treatment for the thread list scroller', async () => {
    const thread = createThread('conv-1', 'Scrollbar alignment thread');
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([thread]),
      pinThread: vi.fn(),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(
      await screen.findByText('Scrollbar alignment thread'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('agent-thread-list-scroll')).toHaveClass(
      'overflow-x-hidden',
      'overflow-y-auto',
      'scrollbar-thin',
    );
  });

  it('archives all active threads from the header action', async () => {
    const firstThread = createThread('conv-1', 'Thread one');
    const secondThread = createThread('conv-2', 'Thread two');
    storeState.activeThreadId = 'conv-1';
    const onNavigate = vi.fn();
    const apiService = createApiService({
      archiveAllThreads: vi.fn().mockResolvedValue({ archivedCount: 2 }),
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([firstThread, secondThread]),
      pinThread: vi.fn(),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(
      <AgentThreadList
        apiService={apiService as never}
        onNavigate={onNavigate}
      />,
    );

    expect(await screen.findByText('Thread one')).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Conversation list actions' }),
    );
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive all' }),
    );

    await waitFor(() => {
      expect(apiService.archiveAllThreads).toHaveBeenCalled();
    });

    expect(storeState.threads).toEqual([]);
    expect(storeState.clearMessages).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('/agent/new');
  });

  it('preserves the active thread when API response does not include it', async () => {
    const activeThread = createThread('conv-active', 'My active chat');
    const otherThread = createThread('conv-2', 'Other thread');

    // Simulate: store already has the active thread (added by AgentFullPage)
    storeState.threads = [activeThread];
    storeState.activeThreadId = 'conv-active';

    // API returns a different thread — does NOT include the active one
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([otherThread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    // Both threads should appear — the active thread is preserved
    expect(await screen.findByText('Other thread')).toBeInTheDocument();
    expect(screen.getByText('My active chat')).toBeInTheDocument();

    // Verify both are in the store
    const ids = storeState.threads.map((t: AgentThread) => t.id);
    expect(ids).toContain('conv-active');
    expect(ids).toContain('conv-2');
  });

  it('shows an accessible animated dot for the active thread while working', async () => {
    const thread = createThread('conv-1', 'Assess desktop app readiness');
    storeState.activeThreadId = 'conv-1';
    storeState.activeRunStatus = 'running';

    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(
      await screen.findByText('Assess desktop app readiness'),
    ).toBeInTheDocument();
    const status = screen.getByRole('status', { name: 'Running' });
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass('rounded-full', 'size-2', 'bg-info');
    expect(status.querySelector('svg')).not.toBeInTheDocument();
  });

  it('shows an accessible animated dot for a non-active running thread', async () => {
    const thread = createThread('conv-1', 'Background run', {
      attentionState: 'running',
      runStatus: 'running',
    } as Partial<AgentThread>);
    storeState.activeThreadId = 'conv-2';
    storeState.activeRunStatus = 'idle';

    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Background run')).toBeInTheDocument();
    const status = screen.getByRole('status', { name: 'Running' });
    expect(status).toHaveClass('rounded-full', 'size-2', 'bg-info');
  });

  it('shows failed state as an accessible status dot', async () => {
    const thread = createThread('conv-1', 'Failed thread', {
      runStatus: 'failed',
    } as Partial<AgentThread>);
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Failed thread')).toBeInTheDocument();
    const failed = screen.getByRole('status', { name: 'Failed' });
    const title = screen.getByText('Failed thread');
    expect(failed).toHaveClass('rounded-full', 'size-2', 'bg-destructive');
    expect(failed.querySelector('svg')).not.toBeInTheDocument();
    expect(
      Boolean(
        failed.compareDocumentPosition(title) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  });

  it('does not show a status pill for a non-active thread with stale running status', async () => {
    const thread = createThread('conv-1', 'Old stuck thread', {
      runStatus: 'running',
    } as Partial<AgentThread>);
    storeState.activeThreadId = 'conv-2';
    storeState.activeRunStatus = 'idle';

    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Old stuck thread')).toBeInTheDocument();
    expect(screen.queryByText('Running')).toBeNull();
  });

  it('ignores a previous brand request that rejects after the next load starts', async () => {
    const brandARequest = createDeferred<AgentThread[]>();
    const brandBRequest = createDeferred<AgentThread[]>();
    const brandBThread = createThread('conv-b', 'Brand B chat', {
      brandId: 'brand-b',
    });
    const getThreads = vi
      .fn()
      .mockReturnValueOnce(brandARequest.promise)
      .mockReturnValueOnce(brandBRequest.promise);
    const apiService = createApiService({
      getThreads,
      unarchiveThread: vi.fn(),
    });

    const { rerender } = render(
      <AgentThreadList apiService={apiService as never} brandId="brand-a" />,
    );

    await waitFor(() => {
      expect(getThreads).toHaveBeenCalledTimes(1);
    });

    rerender(
      <AgentThreadList apiService={apiService as never} brandId="brand-b" />,
    );

    await waitFor(() => {
      expect(getThreads).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      brandARequest.reject(new Error('Brand A request failed late'));
      await Promise.resolve();
    });

    expect(screen.queryByText('Failed to load threads')).toBeNull();
    expect(screen.queryByText('No threads')).toBeNull();

    await act(async () => {
      brandBRequest.resolve([brandBThread]);
    });

    expect(await screen.findByText('Brand B chat')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load threads')).toBeNull();
  });

  it('resets the whole active conversation when the brand scope changes', async () => {
    const brandAThread = createThread('conv-a', 'Brand A chat', {
      brandId: 'brand-a',
    });
    const brandBThread = createThread('conv-b', 'Brand B chat', {
      brandId: 'brand-b',
    });

    // The previous scope left an active, streaming conversation behind.
    storeState.activeThreadId = 'conv-a';
    storeState.activeRunId = 'run-a';
    storeState.activeRunStatus = 'running';
    storeState.composerSeed = {
      content: 'Brand A draft',
      nonce: 1,
      threadId: 'conv-a',
    };
    storeState.draftPlanModeEnabled = true;
    storeState.latestProposedPlan = { id: 'plan-a' };
    storeState.messages = [{ id: 'message-a' }];
    storeState.pendingInputRequest = { id: 'input-a' };
    storeState.runStartedAt = '2026-08-07T00:00:00.000Z';
    storeState.stream = {
      activeToolCalls: [{ id: 'tool-a' }],
      isStreaming: true,
      pendingUiActions: [{ id: 'action-a' }],
      streamingContent: 'Brand A response',
      streamingReasoning: 'Brand A reasoning',
    };
    storeState.threadUiBusyById = { 'conv-a': true };
    storeState.workEvents = [{ id: 'event-a' }];

    const apiService = createApiService({
      getThreads: vi
        .fn()
        .mockResolvedValueOnce([brandAThread])
        .mockResolvedValue([brandBThread]),
      unarchiveThread: vi.fn(),
    });

    const { rerender } = render(
      <AgentThreadList apiService={apiService as never} brandId="brand-a" />,
    );

    expect(await screen.findByText('Brand A chat')).toBeInTheDocument();

    rerender(
      <AgentThreadList apiService={apiService as never} brandId="brand-b" />,
    );

    await waitFor(() => {
      expect(screen.getByText('Brand B chat')).toBeInTheDocument();
    });

    expect(storeState.setActiveThread).toHaveBeenCalledWith(null);
    expect(storeState.resetActiveConversationState).toHaveBeenCalledTimes(1);
    expect(storeState.activeThreadId).toBeNull();
    expect(storeState.activeRunId).toBeNull();
    expect(storeState.activeRunStatus).toBe('idle');
    expect(storeState.composerSeed).toBeNull();
    expect(storeState.draftPlanModeEnabled).toBe(false);
    expect(storeState.latestProposedPlan).toBeNull();
    expect(storeState.messages).toEqual([]);
    expect(storeState.pendingInputRequest).toBeNull();
    expect(storeState.runStartedAt).toBeNull();
    expect(storeState.stream).toEqual({
      activeToolCalls: [],
      isStreaming: false,
      pendingUiActions: [],
      streamingContent: '',
      streamingReasoning: '',
    });
    expect(storeState.threadUiBusyById).toEqual({});
    expect(storeState.workEvents).toEqual([]);
    expect(screen.queryByText('Brand A chat')).toBeNull();
  });

  it('shows an accessible animated dot while a local ui action is busy', async () => {
    const thread = createThread('conv-1', 'Generate launch creative');
    storeState.activeThreadId = 'conv-1';
    storeState.activeRunStatus = 'idle';
    storeState.threadUiBusyById = { 'conv-1': true };

    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(
      await screen.findByText('Generate launch creative'),
    ).toBeInTheDocument();
    const status = screen.getByRole('status', { name: 'Running' });
    expect(status).toBeInTheDocument();
    expect(status).toHaveClass('rounded-full', 'size-2', 'bg-info');
  });
});
