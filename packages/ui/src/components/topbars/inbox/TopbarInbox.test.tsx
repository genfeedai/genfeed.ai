import { render, screen } from '@testing-library/react';
import TopbarInbox from '@ui/topbars/inbox/TopbarInbox';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const overviewState = vi.hoisted(() => ({
  value: {
    isLoading: false,
    refresh: vi.fn(),
    reviewInbox: {
      approvedCount: 1,
      changesRequestedCount: 1,
      pendingCount: 2,
      readyCount: 1,
      recentItems: [
        {
          createdAt: '2026-03-31T09:00:00.000Z',
          format: 'Video',
          id: 'item-1',
          platform: 'YouTube',
          reviewDecision: 'request_changes' as const,
          status: 'needs_review',
          summary: 'Launch reel cutdown',
        },
      ],
      rejectedCount: 1,
    },
  },
}));

vi.mock('@hooks/data/overview/use-overview-bootstrap', () => ({
  useOverviewBootstrap: () => overviewState.value,
}));

vi.mock('@contexts/ui/background-task-context', () => ({
  useBackgroundTaskContext: () => ({
    tasks: [{ id: 'task-1', status: 'processing' }],
  }),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@ui/primitives/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverPanelContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('TopbarInbox', () => {
  it('renders inbox copy instead of activity copy', () => {
    render(<TopbarInbox />);

    expect(
      screen.getByLabelText('Inbox, 5 actionable items'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Inbox')).not.toHaveLength(0);
    expect(screen.getByText(/Approvals, failures/i)).toBeInTheDocument();
    expect(screen.queryByText('Activities')).not.toBeInTheDocument();
  });

  it('counts only actionable inbox items in the trigger badge', () => {
    render(<TopbarInbox />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('links the popover to inbox and activity destinations', () => {
    render(<TopbarInbox />);

    expect(screen.getByRole('link', { name: 'Open Inbox' })).toHaveAttribute(
      'href',
      '/workspace/inbox/unread',
    );
    expect(
      screen.getByRole('link', { name: /View Activity/i }),
    ).toHaveAttribute('href', '/workspace/activity');
  });
});
