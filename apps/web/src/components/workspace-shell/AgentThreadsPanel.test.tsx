import type { AgentThread } from '@genfeedai/agent';
import type {
  AgentChatMessage,
  AgentProposedPlan,
} from '@genfeedai/agent/models/agent-chat.model';
import { AgentThreadKind, AgentThreadStatus } from '@genfeedai/contracts';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AgentThreadsPanel from './AgentThreadsPanel';

// The real composer is a rich-text editor jsdom cannot type into (its own spec
// covers it). This stand-in keeps its contract: send, clear on success, keep
// the draft when the send rejects.
vi.mock('@genfeedai/agent/components/AgentChatInput', async () => {
  const { useState } = await import('react');
  const { Button } = await import('@ui/primitives/button');
  const { Textarea } = await import('@ui/primitives/textarea');
  return {
    AgentChatInput: ({
      disabled,
      onSend,
    }: {
      disabled?: boolean;
      onSend: (content: string) => Promise<boolean | undefined>;
    }) => {
      const [draft, setDraft] = useState('');
      return (
        <div>
          <Textarea
            aria-label="Message"
            isDisabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <Button
            ariaLabel="Send message"
            onClick={async () => {
              try {
                await onSend(draft);
                setDraft('');
              } catch {
                // The draft stays.
              }
            }}
          />
        </div>
      );
    },
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useLocale: () => 'en-US', useTranslations: translateFromCatalog };
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
const respondToUiAction = vi.fn(async () => ({
  executionId: 'execution-2',
  status: 'queued' as const,
  threadId: 'needs',
}));
const apiService = { chatStream, getMessages, respondToUiAction };
const getThreadHref = (threadId: string) => `/acme/~/agent/${threadId}`;

const plan: AgentProposedPlan = {
  content: 'Price ten posts and two videos, then reply with a total.',
  createdAt: '2026-10-29T08:01:00Z',
  id: 'plan-1',
  status: 'awaiting_approval',
  updatedAt: '2026-10-29T08:01:00Z',
};
const planMessage: AgentChatMessage = {
  content: 'I drafted a plan and paused for your approval.',
  createdAt: '2026-10-29T08:01:00Z',
  id: 'message-plan',
  metadata: { proposedPlan: plan },
  role: 'assistant',
  threadId: 'needs',
};

function renderPanel(
  props: Partial<Parameters<typeof AgentThreadsPanel>[0]> = {},
) {
  return render(
    <AgentThreadsPanel
      apiService={apiService}
      getThreadHref={getThreadHref}
      threads={threads}
      {...props}
    />,
  );
}

const section = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) });

describe('AgentThreadsPanel', () => {
  beforeEach(() => {
    getMessages.mockClear();
    chatStream.mockClear();
    respondToUiAction.mockClear();
  });

  it('shows what needs the operator, what runs and what is ready, and never the master', () => {
    renderPanel();

    expect(screen.queryByText('Master')).toBeNull();
    expect(section('Needs you')).toHaveAttribute('aria-expanded', 'true');
    expect(section('Working')).toHaveAttribute('aria-expanded', 'true');
    expect(section('Ready for review')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('link', { name: /Pick a hook/ })).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Needs input' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cut the trailer/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Spring captions/ })).toBeVisible();
  });

  it('folds older and resolved threads under Earlier, with their count', () => {
    renderPanel();

    const earlier = section('Earlier');
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
    expect(earlier).toHaveTextContent('Earlier· 2');
    expect(screen.queryByRole('link', { name: /Old idea/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Shipped reel/ })).toBeNull();
  });

  it('opens Earlier on demand, with resolved threads after the recent ones', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(section('Earlier'));

    const links = within(
      screen.getByTestId('agent-threads-panel-group-earlier'),
    ).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining('Old idea'),
      expect.stringContaining('Shipped reel'),
    ]);
    expect(screen.getByRole('img', { name: 'Resolved' })).toBeInTheDocument();
  });

  it('says nothing needs the operator when only older threads are left', () => {
    renderPanel({
      threads: [makeThread('old', 'Old idea', { runStatus: 'completed' })],
    });

    expect(screen.getByText('Nothing needs you.')).toBeVisible();
    expect(section('Earlier')).toHaveTextContent('Earlier· 1');
  });

  it('has no brand filter of its own and lists only the topbar brand', async () => {
    const user = userEvent.setup();
    renderPanel({ brandId: 'brand-a' });

    expect(screen.queryByLabelText('Filter by brand')).toBeNull();
    expect(screen.getByRole('link', { name: /Spring captions/ })).toBeVisible();
    expect(screen.queryByText('Pick a hook')).toBeNull();
    await user.type(screen.getByLabelText('Search threads'), 'old');
    expect(screen.getByText('No threads match.')).toBeVisible();
  });

  it('names the brand on each row when every brand is listed', () => {
    renderPanel();

    expect(
      within(screen.getByRole('link', { name: /Spring captions/ })).getByText(
        'Moonrise',
      ),
    ).toBeVisible();
  });

  it('unfolds every group a search reaches, and folds Earlier again once cleared', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Search threads'), 'shipped');
    expect(screen.getByRole('link', { name: /Shipped reel/ })).toBeVisible();
    expect(screen.queryByRole('link', { name: /Cut the trailer/ })).toBeNull();

    await user.clear(screen.getByLabelText('Search threads'));
    expect(section('Earlier')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /Shipped reel/ })).toBeNull();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Search threads'), 'zzz');

    expect(screen.getByText('No threads match.')).toBeVisible();
  });

  it('links each row to its thread and opens it in place on a plain click', async () => {
    const onOpenThreadChange = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onOpenThreadChange });

    const row = screen.getByRole('link', { name: /Spring captions/ });
    expect(row).toHaveAttribute('href', '/acme/~/agent/ready');
    await user.click(row);

    expect(await screen.findByText('Here are three captions.')).toBeVisible();
    expect(onOpenThreadChange).toHaveBeenCalledWith('ready');
  });

  it('opens a light view with the last messages and steers the thread', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('link', { name: /Spring captions/ }));

    expect(await screen.findByText('Here are three captions.')).toBeVisible();
    await user.type(
      await screen.findByLabelText('Message'),
      'Make them shorter',
    );
    await user.click(screen.getByLabelText('Send message'));

    await waitFor(() =>
      expect(chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Make them shorter',
          expectedContextVersion: 3,
          threadId: 'ready',
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue(''),
    );
  });

  it('keeps the words and reports a steer that failed', async () => {
    chatStream.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('link', { name: /Spring captions/ }));
    await user.type(await screen.findByLabelText('Message'), 'Shorter');
    await user.click(screen.getByLabelText('Send message'));

    expect(await screen.findByText('Could not send. Try again.')).toBeVisible();
    expect(screen.getByLabelText('Message')).toHaveValue('Shorter');
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('link', { name: /Spring captions/ }));
    await user.click(await screen.findByRole('button', { name: 'Threads' }));

    expect(screen.getByLabelText('Search threads')).toBeVisible();
  });

  it('shows a thread status and what it produced', async () => {
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
    renderPanel();

    await user.click(screen.getByRole('link', { name: /Trailer cut/ }));

    expect(await screen.findByTestId('agent-thread-status')).toHaveTextContent(
      'Running',
    );
    const tiles = await screen.findByRole('list', { name: 'Outputs' });
    expect(within(tiles).getAllByRole('link')).toHaveLength(2);
  });

  it('opens the thread a chip asked for', () => {
    renderPanel({ openThreadId: 'ready' });

    expect(
      screen.getByRole('heading', { name: 'Spring captions' }),
    ).toBeVisible();
  });

  describe('approving a plan from the queue', () => {
    it('approves the plan a waiting thread proposed, in that thread', async () => {
      getMessages.mockResolvedValueOnce([planMessage]);
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('link', { name: /Pick a hook/ }));
      const decision = await screen.findByRole('group', {
        name: 'Plan decision',
      });
      expect(
        screen.getByText(
          'Price ten posts and two videos, then reply with a total.',
        ),
      ).toBeVisible();
      await user.click(
        within(decision).getByRole('button', { name: 'Approve' }),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole('group', { name: 'Plan decision' }),
        ).toBeNull(),
      );
      expect(respondToUiAction).toHaveBeenCalledWith(
        'needs',
        'approve_plan',
        { planId: 'plan-1' },
        undefined,
        { brandId: null, expectedContextVersion: 3 },
      );
    });

    it('reads Approved at once, before the run records the approval', async () => {
      getMessages
        .mockResolvedValueOnce([planMessage])
        .mockResolvedValueOnce([planMessage]);
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('link', { name: /Pick a hook/ }));
      const decision = await screen.findByRole('group', {
        name: 'Plan decision',
      });
      await user.click(
        within(decision).getByRole('button', { name: 'Approve' }),
      );

      const plan = await screen.findByRole('region', { name: 'Plan' });
      await waitFor(() =>
        expect(within(plan).getByText('Approved')).toBeVisible(),
      );
      expect(within(plan).queryByText('Awaiting review')).toBeNull();
    });

    it('sends a plan back with the changes asked for', async () => {
      getMessages.mockResolvedValueOnce([planMessage]);
      const user = userEvent.setup();
      renderPanel({ openThreadId: 'needs' });

      await user.click(
        await screen.findByRole('button', { name: 'Request changes' }),
      );
      await user.type(
        screen.getByLabelText('Describe what to change in the plan'),
        'Only five posts',
      );
      await user.click(screen.getByRole('button', { name: 'Send changes' }));

      await waitFor(() =>
        expect(respondToUiAction).toHaveBeenCalledWith(
          'needs',
          'revise_plan',
          { planId: 'plan-1', revisionNote: 'Only five posts' },
          undefined,
          { brandId: null, expectedContextVersion: 3 },
        ),
      );
    });

    it('keeps the decision open and says so when it could not be sent', async () => {
      getMessages.mockResolvedValueOnce([planMessage]);
      respondToUiAction.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderPanel({ openThreadId: 'needs' });

      await user.click(await screen.findByRole('button', { name: 'Approve' }));

      expect(
        await screen.findByText('Could not send your decision. Try again.'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    });

    it('offers no decision on a resolved thread', async () => {
      getMessages.mockResolvedValueOnce([{ ...planMessage, threadId: 'done' }]);
      renderPanel({ openThreadId: 'done' });

      expect(await screen.findByTestId('agent-plan-card')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    });
  });

  describe('resolving threads', () => {
    it('resolves an active thread and reopens a resolved one from its row menu', async () => {
      const onResolveThread = vi.fn();
      const onReopenThread = vi.fn();
      const user = userEvent.setup();
      renderPanel({ onReopenThread, onResolveThread });

      await user.click(
        screen.getByRole('button', { name: 'Actions for Cut the trailer' }),
      );
      await user.click(
        await screen.findByRole('menuitem', { name: 'Resolve' }),
      );
      await user.click(section('Earlier'));
      await user.click(
        screen.getByRole('button', { name: 'Actions for Shipped reel' }),
      );
      await user.click(await screen.findByRole('menuitem', { name: 'Reopen' }));

      expect(onResolveThread).toHaveBeenCalledWith('running');
      expect(onReopenThread).toHaveBeenCalledWith('done');
    });

    it('has no row menu where the surface offers no action', () => {
      renderPanel();

      expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
    });

    it('lists resolved threads the store never loaded', async () => {
      const user = userEvent.setup();
      renderPanel({
        resolvedThreads: [
          makeThread('loaded-later', 'Old launch', {
            status: AgentThreadStatus.ARCHIVED,
          }),
        ],
      });

      await user.click(section('Earlier'));

      expect(screen.getByRole('link', { name: /Old launch/ })).toBeVisible();
    });

    it('offers Load more at the foot of an open Earlier group', async () => {
      const onLoadMoreResolved = vi.fn();
      const user = userEvent.setup();
      renderPanel({ hasMoreResolved: true, onLoadMoreResolved });
      expect(
        screen.queryByRole('button', { name: 'Load more resolved' }),
      ).toBeNull();

      await user.click(section('Earlier'));
      await user.click(
        screen.getByRole('button', { name: 'Load more resolved' }),
      );

      expect(onLoadMoreResolved).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['every resolved thread is loaded', { hasMoreResolved: false }],
      ['the surface cannot page', { hasMoreResolved: true }],
    ])('offers no Load more when %s', async (_label, props) => {
      const user = userEvent.setup();
      renderPanel(props);

      await user.click(section('Earlier'));

      expect(screen.getByRole('link', { name: /Shipped reel/ })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'Load more resolved' }),
      ).toBeNull();
    });

    it('holds Load more while the next page is on its way', async () => {
      const user = userEvent.setup();
      renderPanel({
        hasMoreResolved: true,
        isLoadingMoreResolved: true,
        onLoadMoreResolved: vi.fn(),
      });

      await user.click(section('Earlier'));

      expect(
        screen.getByRole('button', { name: 'Load more resolved' }),
      ).toBeDisabled();
    });

    it('lets a resolved thread be read but not steered until it is reopened', async () => {
      const onReopenThread = vi.fn();
      const user = userEvent.setup();
      renderPanel({ onReopenThread, openThreadId: 'done' });

      expect(screen.getByTestId('agent-thread-status')).toHaveTextContent(
        'Resolved',
      );
      expect(await screen.findByLabelText('Message')).toBeDisabled();
      expect(screen.getByText('Reopen this thread to steer it.')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Reopen' }));

      expect(onReopenThread).toHaveBeenCalledWith('done');
    });
  });
});
