import { AgentThreadList } from '@cloud/agent/components/AgentThreadList';
import type { AgentThread } from '@cloud/agent/models/agent-chat.model';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: function MockLink(props: {
    children?: ReactNode;
    href: string;
    onClick?: () => void | Promise<void>;
    className?: string;
  }) {
    return (
      <a className={props.className} href={props.href} onClick={props.onClick}>
        {props.children}
      </a>
    );
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
  activeRunStatus:
    | 'idle'
    | 'running'
    | 'cancelling'
    | 'completed'
    | 'failed'
    | 'cancelled';
  activeThreadId: string | null;
  clearThreadAttention: ReturnType<typeof vi.fn>;
  clearMessages: ReturnType<typeof vi.fn>;
  resetStreamState: ReturnType<typeof vi.fn>;
  stream: {
    isStreaming: boolean;
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
}

const storeState: AgentChatStoreState = {
  activeRunStatus: 'idle',
  activeThreadId: null,
  clearMessages: vi.fn(),
  clearThreadAttention: vi.fn(),
  resetStreamState: vi.fn(),
  setActiveRun: vi.fn(),
  setActiveThread: vi.fn(),
  setError: vi.fn(),
  setMessages: vi.fn(),
  setThreadPrompt: vi.fn(),
  setThreads: vi.fn((threads: AgentThread[]) => {
    storeState.threads = threads;
  }),
  setThreadUiBusy: vi.fn(),
  setWorkEvents: vi.fn(),
  stream: {
    isStreaming: false,
  },
  threads: [],
  threadUiBusyById: {},
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
    createdAt: '2026-03-08T12:00:00.000Z',
    id,
    isPinned: false,
    status: 'active' as never,
    title,
    updatedAt: '2026-03-08T12:00:00.000Z',
    ...overrides,
  };
}

const EFFECT_METHOD_MAP = {
  archiveAllThreads: 'archiveAllThreadsEffect',
  archiveThread: 'archiveThreadEffect',
  branchThread: 'branchThreadEffect',
  getMessages: 'getMessagesEffect',
  getThread: 'getThreadEffect',
  getThreads: 'getThreadsEffect',
  pinThread: 'pinThreadEffect',
  unarchiveThread: 'unarchiveThreadEffect',
  unpinThread: 'unpinThreadEffect',
  updateThread: 'updateThreadEffect',
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
  });
}

describe('AgentThreadList', () => {
  beforeEach(() => {
    storeState.activeRunStatus = 'idle';
    storeState.activeThreadId = null;
    storeState.threads = [];
    storeState.clearMessages.mockReset();
    storeState.clearThreadAttention.mockReset();
    storeState.resetStreamState.mockReset();
    storeState.setActiveRun.mockReset();
    storeState.setActiveThread.mockReset();
    storeState.setThreadPrompt.mockReset();
    storeState.setThreads.mockClear();
    storeState.setThreadUiBusy.mockReset();
    storeState.setError.mockReset();
    storeState.setMessages.mockReset();
    storeState.setWorkEvents.mockReset();
    storeState.stream.isStreaming = false;
    storeState.threadUiBusyById = {};
  });

  it('shows a load failure state instead of the empty state on fetch errors', async () => {
    const apiService = createApiService({
      getThreads: vi.fn().mockRejectedValue(new Error('Network down')),
    });

    render(<AgentThreadList apiService={apiService as never} />);

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

    fireEvent.click(
      screen.getByRole('button', { name: 'Show archived threads' }),
    );

    await waitFor(() => {
      expect(screen.getByText('Archived thread')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: 'Show recent threads' }),
    ).toBeInTheDocument();
    expect(apiService.getThreads).toHaveBeenNthCalledWith(
      2,
      { limit: 50, status: 'archived' },
      expect.any(AbortSignal),
    );
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

    expect(threadLink).toHaveAttribute('href', '/chat/conv-1');
    expect(threadLink?.parentElement).toHaveClass('h-9');
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

    expect(onNavigate).toHaveBeenCalledWith('/chat/new');
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Show archived threads' }),
    );

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
      expect(onNavigate).toHaveBeenCalledWith('/chat/conv-2');
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

  it('renders one-line rows without preview text', async () => {
    const thread = createThread('conv-1', 'Compact row', {
      lastAssistantPreview: 'This preview should not render anymore.',
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    expect(await screen.findByText('Compact row')).toBeInTheDocument();
    expect(
      screen.queryByText('This preview should not render anymore.'),
    ).toBeNull();
    expect(screen.queryByText('Awaiting response')).toBeNull();
  });

  it('uses a warning status dot for threads that need input', async () => {
    const thread = createThread('conv-1', 'Needs your reply', {
      pendingInputCount: 1,
    });
    const apiService = createApiService({
      getThreads: vi.fn().mockResolvedValue([thread]),
      unarchiveThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    const statusDot = await screen.findByLabelText(
      'Needs input status for Needs your reply',
    );

    expect(statusDot).toHaveClass('bg-amber-300');
    expect(screen.queryByText('Needs input')).toBeNull();
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
    expect(
      screen.getByRole('button', { name: 'Archive all threads' }),
    ).toBeInTheDocument();
  });

  it('renders pinned conversations in a lighter section above the rest of the list', async () => {
    const pinnedThread = {
      ...createThread('conv-2', 'Pinned thread'),
      isPinned: true,
      updatedAt: '2026-03-08T11:00:00.000Z',
    };
    const regularThread = createThread('conv-1', 'Later thread');
    const apiService = createApiService({
      branchThread: vi.fn(),
      getThreads: vi.fn().mockResolvedValue([regularThread, pinnedThread]),
      pinThread: vi.fn(),
      unarchiveThread: vi.fn(),
      unpinThread: vi.fn(),
      updateThread: vi.fn(),
    });

    render(<AgentThreadList apiService={apiService as never} />);

    const pinnedSection = await screen.findByTestId('pinned-thread-section');

    expect(pinnedSection).not.toHaveClass('sticky');
    expect(screen.queryByText('Pinned')).toBeNull();
    expect(pinnedSection.textContent?.indexOf('Pinned thread')).toBeGreaterThan(
      -1,
    );
    expect(pinnedSection.textContent?.includes('Later thread')).toBeFalsy();
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Archive all threads' }),
    );

    await waitFor(() => {
      expect(apiService.archiveAllThreads).toHaveBeenCalled();
    });

    expect(storeState.threads).toEqual([]);
    expect(storeState.clearMessages).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith('/chat/new');
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

  it('shows an inline spinner for the active thread while its conversation is working', async () => {
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
    expect(
      screen.getByLabelText(
        'Awaiting response status for Assess desktop app readiness',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        'Awaiting response status for Assess desktop app readiness',
      ),
    ).toHaveClass('animate-spin');
    expect(screen.queryByText('Awaiting response')).toBeNull();
    expect(screen.getByTitle('Awaiting response')).toBeInTheDocument();
  });

  it('does not show a spinner for a non-active thread with stale running status', async () => {
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
    expect(
      screen.queryByLabelText('Awaiting response status for Old stuck thread'),
    ).toBeNull();
    expect(
      screen.getByLabelText('Conversation status for Old stuck thread'),
    ).not.toHaveClass('animate-spin');
  });

  it('shows an inline spinner for the active thread while a local ui action is busy', async () => {
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
    expect(
      screen.getByLabelText('Conversation status for Generate launch creative'),
    ).toHaveClass('animate-spin');
  });
});
