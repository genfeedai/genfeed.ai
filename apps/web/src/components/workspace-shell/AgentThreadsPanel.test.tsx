import type { AgentThread } from '@genfeedai/agent';
import type { AgentChatMessage } from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentThreadsPanel from './AgentThreadsPanel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

function makeThread(
  id: string,
  title: string,
  overrides: Partial<AgentThread> = {},
): AgentThread {
  return {
    contextVersion: 3,
    createdAt: '2026-10-29T08:00:00Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title,
    updatedAt: '2026-10-29T08:00:00Z',
    ...overrides,
  };
}

const threads: AgentThread[] = [
  makeThread('master-1', 'Master', { kind: AgentThreadKind.MASTER }),
  makeThread('needs', 'Pick a hook', { pendingInputCount: 1 }),
  makeThread('running', 'Cut the trailer', { runStatus: 'running' }),
  makeThread('ready', 'Spring captions', {
    attentionState: 'updated',
    brandId: 'brand-a',
    brandLabel: 'Moonrise',
  }),
  makeThread('child', 'Trailer cut', {
    lastGeneratedAssetUrl: 'https://cdn.example.com/trailer.mp4',
    parentThreadId: 'master-1',
    runStatus: 'running',
  }),
  makeThread('done', 'Shipped reel', {
    status: AgentThreadStatus.ARCHIVED,
  }),
  makeThread('old', 'Old idea', {
    brandId: 'brand-b',
    brandLabel: 'Second',
    lastAssistantPreview: 'Parked last week',
  }),
];

const message: AgentChatMessage = {
  content: 'Here are three captions.',
  createdAt: '2026-10-29T08:01:00Z',
  id: 'message-1',
  role: 'assistant',
  threadId: 'ready',
};

const getMessages = vi.fn(async (): Promise<AgentChatMessage[]> => [message]);
const chatStream = vi.fn(async () => ({
  brandId: null,
  clientRequestId: 'req-1',
  contextId: 'context-1',
  contextVersion: 4,
  executionId: 'execution-1',
  queuedAt: '2026-10-29T08:02:00Z',
  status: 'queued' as const,
  threadId: 'ready',
}));
const apiService = { chatStream, getMessages };

describe('AgentThreadsPanel', () => {
  beforeEach(() => {
    getMessages.mockClear();
    chatStream.mockClear();
  });

  it('groups threads by what needs the operator and never lists the master', () => {
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    expect(screen.queryByText('Master')).toBeNull();
    const group = (key: string) =>
      screen.getByTestId(`agent-threads-panel-group-${key}`);
    expect(within(group('needsYou')).getByText('Pick a hook')).toBeVisible();
    expect(within(group('working')).getByText('Cut the trailer')).toBeVisible();
    expect(
      within(group('readyForReview')).getByText('Spring captions'),
    ).toBeVisible();
    expect(within(group('recent')).getByText('Old idea')).toBeVisible();
  });

  it('filters by search', async () => {
    const user = userEvent.setup();
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.type(screen.getByLabelText('Search threads'), 'trailer');

    expect(screen.getByText('Cut the trailer')).toBeVisible();
    expect(screen.queryByText('Old idea')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.type(screen.getByLabelText('Search threads'), 'zzz');

    expect(screen.getByText('No threads match.')).toBeVisible();
  });

  it('opens a light view with the last messages and steers the thread', async () => {
    const user = userEvent.setup();
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.click(screen.getByTestId('agent-threads-panel-thread-ready'));

    expect(await screen.findByText('Here are three captions.')).toBeVisible();
    expect(getMessages).toHaveBeenCalledWith(
      'ready',
      { limit: 20 },
      expect.any(AbortSignal),
    );

    await user.type(
      screen.getByLabelText('Steer this thread'),
      'Make them shorter',
    );
    await user.click(screen.getByRole('button', { name: 'Steer' }));

    await waitFor(() =>
      expect(chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Make them shorter',
          expectedContextVersion: 3,
          threadId: 'ready',
        }),
      ),
    );
    expect(await screen.findByText('Sent.')).toBeVisible();
    expect(screen.getByLabelText('Steer this thread')).toHaveValue('');
  });

  it('keeps the words and reports a steer that failed', async () => {
    chatStream.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.click(screen.getByTestId('agent-threads-panel-thread-ready'));
    await user.type(
      await screen.findByLabelText('Steer this thread'),
      'Shorter',
    );
    await user.click(screen.getByRole('button', { name: 'Steer' }));

    expect(await screen.findByText('Could not send. Try again.')).toBeVisible();
    expect(screen.getByLabelText('Steer this thread')).toHaveValue('Shorter');
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.click(screen.getByTestId('agent-threads-panel-thread-ready'));
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    expect(screen.getByTestId('agent-threads-panel')).toBeVisible();
  });

  it('says who started a thread, its status and what it produced', async () => {
    const user = userEvent.setup();
    getMessages.mockResolvedValueOnce([
      {
        ...message,
        metadata: {
          contentType: 'image',
          mediaUrl: 'https://cdn.example.com/frame.png',
        },
        threadId: 'child',
      },
    ]);
    render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

    await user.click(screen.getByTestId('agent-threads-panel-thread-child'));

    expect(
      await screen.findByTestId('agent-thread-started-by'),
    ).toHaveTextContent('Started by Master');
    expect(screen.getByTestId('agent-thread-status')).toHaveTextContent(
      'Running',
    );
    const tiles = await screen.findByTestId('agent-thread-assets');
    expect(within(tiles).getAllByRole('link')).toHaveLength(2);
  });

  it('opens the thread a chip asked for', () => {
    render(
      <AgentThreadsPanel
        apiService={apiService}
        openThreadId="ready"
        threads={threads}
      />,
    );

    expect(screen.getByTestId('agent-thread-light-view')).toBeVisible();
    expect(screen.getByText('Spring captions')).toBeVisible();
  });

  describe('resolving threads', () => {
    it('lists an archived thread under Resolved, not with the active ones', () => {
      render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

      const resolved = screen.getByTestId('agent-threads-panel-group-resolved');
      expect(within(resolved).getByText('Shipped reel')).toBeVisible();
      expect(
        within(screen.getByTestId('agent-threads-panel-group-recent')).queryByText(
          'Shipped reel',
        ),
      ).toBeNull();
    });

    it('lists resolved threads the store never loaded', () => {
      render(
        <AgentThreadsPanel
          apiService={apiService}
          resolvedThreads={[
            makeThread('loaded-later', 'Old launch', {
              status: AgentThreadStatus.ARCHIVED,
            }),
          ]}
          threads={threads}
        />,
      );

      expect(
        within(screen.getByTestId('agent-threads-panel-group-resolved')).getByText(
          'Old launch',
        ),
      ).toBeVisible();
    });

    it('resolves an active thread and reopens a resolved one from its row', async () => {
      const onResolveThread = vi.fn();
      const onReopenThread = vi.fn();
      const user = userEvent.setup();
      render(
        <AgentThreadsPanel
          apiService={apiService}
          onReopenThread={onReopenThread}
          onResolveThread={onResolveThread}
          threads={threads}
        />,
      );

      await user.click(
        screen.getByRole('button', { name: 'Resolve: Cut the trailer' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Reopen: Shipped reel' }),
      );

      expect(onResolveThread).toHaveBeenCalledWith('running');
      expect(onReopenThread).toHaveBeenCalledWith('done');
    });

    it('has no resolve action where the surface offers none', () => {
      render(<AgentThreadsPanel apiService={apiService} threads={threads} />);

      expect(screen.queryByRole('button', { name: /^Resolve:/ })).toBeNull();
    });

    it('lets a resolved thread be read but not steered until it is reopened', async () => {
      const onReopenThread = vi.fn();
      const user = userEvent.setup();
      render(
        <AgentThreadsPanel
          apiService={apiService}
          onReopenThread={onReopenThread}
          openThreadId="done"
          threads={threads}
        />,
      );

      expect(screen.getByTestId('agent-thread-resolved')).toHaveTextContent(
        'Resolved',
      );
      expect(screen.getByLabelText('Steer this thread')).toBeDisabled();
      expect(screen.getByText('Reopen this thread to steer it.')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Reopen' }));

      expect(onReopenThread).toHaveBeenCalledWith('done');
    });
  });
});
