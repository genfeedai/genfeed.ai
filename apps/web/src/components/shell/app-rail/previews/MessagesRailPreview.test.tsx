import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessagesRailPreview from './MessagesRailPreview';

const query = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isError: false,
    isPending: false,
  },
}));

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: () => query.current,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({ brandId: 'brand-1' }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));

const CONVERSATIONS = {
  items: [
    {
      id: 'c1',
      latestMessageAt: '2026-11-12T08:00:00.000Z',
      latestMessageText: 'Can you send the reel?',
      participantAvatarUrl: null,
      participantHandle: 'ada',
      participantName: 'Ada Lovelace',
      unreadCount: 3,
      updatedAt: '2026-11-12T08:00:00.000Z',
    },
    {
      id: 'c2',
      latestMessageAt: null,
      latestMessageText: 'Thanks!',
      participantAvatarUrl: null,
      participantHandle: 'grace',
      participantName: '',
      unreadCount: 0,
      updatedAt: '2026-11-11T08:00:00.000Z',
    },
  ],
};

describe('MessagesRailPreview', () => {
  beforeEach(() => {
    query.current = { data: undefined, isError: false, isPending: false };
  });

  it('lists the latest conversations, linking each to Messages', () => {
    query.current = { data: CONVERSATIONS, isError: false, isPending: false };
    render(<MessagesRailPreview href="/acme/messages" />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Can you send the reel?')).toBeInTheDocument();
    // A conversation without a display name falls back to the handle.
    expect(screen.getByText('grace')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href', '/acme/messages');
    }
  });

  it('flags unread conversations with their count', () => {
    query.current = { data: CONVERSATIONS, isError: false, isPending: false };
    render(<MessagesRailPreview href="/acme/messages" />);

    expect(screen.getByLabelText('unread:3')).toBeInTheDocument();
  });

  it('shows placeholder rows while loading', () => {
    query.current = { data: undefined, isError: false, isPending: true };
    render(<MessagesRailPreview href="/acme/messages" />);

    expect(screen.getByTestId('app-rail-preview-loading')).toBeInTheDocument();
  });

  it('says so when there are no conversations', () => {
    query.current = { data: { items: [] }, isError: false, isPending: false };
    render(<MessagesRailPreview href="/acme/messages" />);

    expect(screen.getByText('empty')).toBeInTheDocument();
  });

  it('shows the error state when the request fails', () => {
    query.current = { data: undefined, isError: true, isPending: false };
    render(<MessagesRailPreview href="/acme/messages" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByTestId('app-rail-preview-loading')).toBeNull();
  });
});
