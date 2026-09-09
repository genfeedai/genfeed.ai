import type { INotificationInboxItem } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/shell/ActivityFeed', () => ({
  ActivityFeedContent: () => (
    <a href="/workspace/activity">View all activity</a>
  ),
}));

const live = vi.hoisted(() => ({ activeCount: 0 }));
vi.mock('@/components/shell/use-live-activity-feed', () => ({
  useLiveActivityFeed: () => live,
}));
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

import NotificationInboxMenu from './NotificationInboxMenu';

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
  live.activeCount = 0;
  current = state();
  hook.mockImplementation(() => current);
});
async function open() {
  const user = userEvent.setup();
  render(<NotificationInboxMenu />);
  await user.click(
    screen.getByRole('button', { name: 'Open notifications, 1 unread' }),
  );
  return user;
}
describe('NotificationInboxMenu', () => {
  it('opens the live activity view when a generation is running', async () => {
    live.activeCount = 7;
    await open();
    expect(
      screen.getByRole('status', { name: '7 tasks in progress' }),
    ).toHaveTextContent('7');
    expect(screen.getByRole('tab', { name: 'Activity (7)' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
  it('defaults to notifications and keeps activity in a separate tab', async () => {
    const user = await open();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(
      screen.getByRole('link', { name: 'View all activity' }),
    ).toHaveAttribute('href', '/workspace/activity');
    expect(
      screen.queryByRole('button', { name: 'Mark all read' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(
      screen.getByRole('button', { name: 'Mark all read' }),
    ).toBeInTheDocument();
  });
  it('exposes unread state, source link, read actions, and older pages', async () => {
    const user = await open();
    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open run' })).toHaveAttribute(
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
  it('keeps existing rows and failed read action retryable', async () => {
    current.read.isError = true;
    const user = await open();
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
    await open();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open run' }),
    ).not.toBeInTheDocument();
  });
  it('shows loading and empty states', async () => {
    current.history.isLoading = true;
    current.history.data.pages = [];
    const user = userEvent.setup();
    const view = render(<NotificationInboxMenu />);
    await user.click(
      screen.getByRole('button', { name: 'Open notifications, 1 unread' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading notifications',
    );
    current.history.isLoading = false;
    view.rerender(<NotificationInboxMenu />);
    expect(screen.getByText(/You are all caught up/)).toBeInTheDocument();
  });
  it('shows load failure and allows retry', async () => {
    current.history.isError = true;
    const user = await open();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load notifications',
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(current.history.refetch).toHaveBeenCalled();
  });
  it('supports keyboard opening and escape to return focus', async () => {
    const user = userEvent.setup();
    render(<NotificationInboxMenu />);
    const trigger = screen.getByRole('button', {
      name: 'Open notifications, 1 unread',
    });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('heading', { name: 'Notifications' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });
});
