import { CredentialPlatform, PageScope, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import PostDetailHeader from '@pages/posts/detail/components/PostDetailHeader';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'post-1',
    isDeleted: false,
    label: 'Launch announcement',
    platform: CredentialPlatform.TWITTER,
    status: PostStatus.DRAFT,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as IPost;
}

function renderHeader(overrides: Partial<IPost> = {}, props = {}) {
  const onViewModeChange = vi.fn();
  const onDelete = vi.fn();
  const onExpandToThread = vi.fn();
  const onCreateRemix = vi.fn();

  render(
    <PostDetailHeader
      post={buildPost(overrides)}
      scope={PageScope.PUBLISHING}
      isPublished={false}
      hasChildren={false}
      viewMode="edit"
      onViewModeChange={onViewModeChange}
      onDelete={onDelete}
      onCreateRemix={onCreateRemix}
      onExpandToThread={onExpandToThread}
      {...props}
    />,
  );

  return { onCreateRemix, onDelete, onExpandToThread, onViewModeChange };
}

describe('PostDetailHeader', () => {
  it('renders the post label as the heading', () => {
    renderHeader();

    expect(
      screen.getByRole('heading', { name: 'Launch announcement' }),
    ).toBeInTheDocument();
  });

  it('falls back to a platform label when the post has no label', () => {
    renderHeader({ label: undefined });

    expect(
      screen.queryByRole('heading', { name: 'Launch announcement' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Post detail')).toBeInTheDocument();
  });

  it('shows edit-only controls for an editable publisher post', () => {
    renderHeader();

    expect(
      screen.getByRole('button', { name: /preview/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('hides edit-only controls once the post is published', () => {
    renderHeader({}, { isPublished: true });

    expect(
      screen.queryByRole('button', { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it('toggles the view mode', async () => {
    const user = userEvent.setup();
    const { onViewModeChange } = renderHeader();

    await user.click(screen.getByRole('button', { name: /preview/i }));

    expect(onViewModeChange).toHaveBeenCalledWith('preview');
  });

  it('calls onDelete when the delete button is pressed', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHeader();

    await user.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers expand-to-thread for an editable twitter post without children', () => {
    renderHeader();

    expect(
      screen.getByRole('button', { name: /expand to thread/i }),
    ).toBeInTheDocument();
  });

  it('hides expand-to-thread once the post already has children', () => {
    renderHeader({}, { hasChildren: true });

    expect(
      screen.queryByRole('button', { name: /expand to thread/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a live post link when the platform url is present', () => {
    renderHeader({ platformUrl: 'https://x.com/post/1' });

    expect(
      screen.getByRole('link', { name: /open published post/i }),
    ).toHaveAttribute('href', 'https://x.com/post/1');
  });

  it('offers remix, performance and agent links for public posts', () => {
    renderHeader({ status: PostStatus.PUBLIC });

    expect(screen.getByRole('button', { name: /remix/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /performance/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /ask agent/i }),
    ).toBeInTheDocument();
  });
});
