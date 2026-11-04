import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import type { INotificationInboxItem } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.fn();
vi.mock('@/components/shell/use-notification-inbox', () => ({
  useNotificationInbox: (...args: unknown[]) => hook(...args),
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../tests/next-intl.stub'
  );
  return { useTranslations: translateFromCatalog };
});

import NotificationInboxPanel from './NotificationInboxPanel';

const item: INotificationInboxItem = {
  id: 'item-1',
  topic: 'agent.status',
  occurredAt: '2026-09-05T10:00:00Z',
  readAt: null,
  outcome: 'failed',
  sourceHref: '/acme/brand/agent/thread-1',
  sourceLabel: 'My task',
  failure: null,
};
function state() {
  return {
    organizationId: 'acme',
    count: { data: { unreadCount: 1 }, isError: false, refetch: vi.fn() },
    history: {
      data: { pages: [{ items: [item] }] },
      isLoading: false,
      isError: false,
      isFetching: false,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    },
    read: {
      isPending: false,
      isError: false,
      mutate: vi.fn(),
      variables: ['item-1'],
    },
  };
}
let current: ReturnType<typeof state>;
beforeEach(() => {
  current = state();
  hook.mockImplementation(() => current);
});
function open() {
  const user = userEvent.setup();
  render(<NotificationInboxPanel isActive />);
  return user;
}
describe('NotificationInboxPanel', () => {
  it('shows alerts only, with no activity tab or live activity', async () => {
    open();
    expect(
      screen.getByRole('heading', { name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark all read' }),
    ).toBeInTheDocument();
  });
  it('titles a policy alert from its source activity', async () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        topic: 'billing.credits',
        outcome: 'failed',
        severity: 'warning',
        sourceHref: '/acme/workspace/activity',
        sourceLabel: null,
        activity: {
          id: 'activity-1',
          key: ActivityKey.CREDITS_LOW,
          value: null,
          source: ActivitySource.SCRIPT,
          brandId: null,
          entityId: null,
          entityModel: null,
          createdAt: '2026-09-05T10:00:00Z',
        },
      },
    ];
    open();
    expect(screen.getByText('Credits are running low')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Credits are running low/ }),
    ).toHaveAttribute('href', '/acme/workspace/activity');
  });
  it('summarizes a generation failure without rendering its JSON or provider diagnostics', () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        topic: 'generation.status',
        activity: {
          id: 'activity-1',
          key: ActivityKey.MUSIC_FAILED,
          value: JSON.stringify({
            error: 'Provider timed out: secret_api_key',
            ingredientId: 'private-asset-id',
            label: 'Music Generation',
          }),
          source: ActivitySource.MUSIC_GENERATION,
          brandId: 'brand-1',
          entityId: 'private-asset-id',
          entityModel: 'Ingredient',
          createdAt: '2026-09-05T10:00:00Z',
        },
      },
    ];
    open();
    expect(
      screen.getByText('The provider timed out. Try again.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /music/i })).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Notifications' }),
    ).not.toHaveTextContent(
      /secret_api_key|private-asset-id|ingredientId|Image Generation/,
    );
  });

  it('washes the full notification row on hover, including time and mark-read', async () => {
    open();
    const row = screen.getByTestId('notification-inbox-row');
    expect(row).toHaveClass('hover:bg-accent');
    expect(row).toContainElement(screen.getByRole('link', { name: /My task/ }));
    expect(row).toContainElement(
      screen.getByRole('button', { name: 'Mark read' }),
    );
    expect(row).toHaveTextContent(/ago/);
  });

  it('exposes unread state, source link, read actions, and older pages', async () => {
    const user = open();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /My task/ })).toHaveAttribute(
      'href',
      item.sourceHref,
    );
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(current.read.mutate).toHaveBeenCalledWith(['item-1']);
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(current.read.mutate).toHaveBeenCalledWith(null);
    await user.click(
      screen.getByRole('button', { name: 'Load older notifications' }),
    );
    expect(current.history.fetchNextPage).toHaveBeenCalled();
  });

  it('opens the result asset from the whole notification row', async () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        topic: 'workflow.status',
        outcome: 'completed',
        sourceHref: '/acme/brand/library/images?asset=img-1',
        sourceLabel: null,
        failure: null,
      },
    ];
    open();
    expect(
      screen.getByRole('link', { name: /Workflow completed/ }),
    ).toHaveAttribute('href', '/acme/brand/library/images?asset=img-1');
    expect(
      screen.queryByRole('button', { name: 'Mark read' }),
    ).toBeInTheDocument();
  });
  it('links a social reply notification to Messages', async () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        topic: 'social.reply',
        outcome: 'completed',
        sourceHref: '/acme/brand/messages',
        sourceLabel: null,
        failure: null,
        socialReply: { accountHandle: 'acme', replyCount: 3 },
      },
    ];
    open();
    expect(screen.getByText('3 new replies on @acme')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new repl/ })).toHaveAttribute(
      'href',
      '/acme/brand/messages',
    );
  });
  it('marks an unread item read when its link is opened', async () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        topic: 'social.reply',
        outcome: 'completed',
        sourceHref: '/acme/brand/messages?socialConversation=conversation-1',
        sourceLabel: null,
        failure: null,
        socialReply: { accountHandle: 'acme', replyCount: 1 },
      },
    ];
    const user = open();
    const link = screen.getByRole('link', { name: /new repl/ });
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(current.read.mutate).toHaveBeenCalledWith(['item-1']);
  });
  it('does not re-read an already read item when its link is opened', async () => {
    current.history.data.pages[0].items = [
      { ...item, readAt: '2026-09-05T11:00:00Z' },
    ];
    const user = open();
    const link = screen.getByRole('link', { name: /My task/ });
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(current.read.mutate).not.toHaveBeenCalled();
  });
  it('keeps existing rows and failed read action retryable', async () => {
    current.read.isError = true;
    const user = open();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not mark notifications read',
    );
    expect(screen.getByText('Unread')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(current.read.mutate).toHaveBeenCalledWith(['item-1']);
  });
  it('shows a source unavailable state without inventing navigation', async () => {
    current.history.data.pages[0].items = [
      { ...item, sourceHref: null, sourceLabel: null },
    ];
    open();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open run' }),
    ).not.toBeInTheDocument();
  });
  it('shows loading and empty states', async () => {
    current.history.isLoading = true;
    current.history.data.pages = [];
    const view = render(<NotificationInboxPanel isActive />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading notifications',
    );
    current.history.isLoading = false;
    view.rerender(<NotificationInboxPanel isActive />);
    expect(screen.getByText(/You are all caught up/)).toBeInTheDocument();
  });
  it('shows load failure and allows retry', async () => {
    current.history.isError = true;
    const user = open();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load notifications',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(current.history.refetch).toHaveBeenCalled();
  });
  it('uses a left dot and a two-line description without an action label', async () => {
    current.history.data.pages[0].items = [
      {
        ...item,
        failure: {
          title: 'Run failed',
          summary: 'The agent hit an error while running.',
          recovery: 'Inspect the failing step before trying again.',
        },
      },
    ];
    open();
    expect(screen.getByText(/The agent hit an error/)).toHaveClass(
      'line-clamp-2',
    );
    expect(screen.queryByText('Open run')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    const row = screen.getByTestId('notification-inbox-row');
    expect(row.firstElementChild).toContainElement(
      screen.getByRole('button', { name: 'Mark read' }),
    );
    expect(row).not.toHaveClass('rounded-md');
  });
  it('loads history only while its view is on screen', () => {
    const view = render(<NotificationInboxPanel isActive={false} />);
    expect(hook).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();
    view.rerender(<NotificationInboxPanel isActive />);
    expect(hook).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole('heading', { name: 'Notifications' }),
    ).toBeInTheDocument();
  });
  it('has no close control: the topbar bell closes it', () => {
    open();
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });
  it('tells its host when a notification opens', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<NotificationInboxPanel isActive onNavigate={onNavigate} />);
    await user.click(screen.getByRole('link', { name: /My task/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
