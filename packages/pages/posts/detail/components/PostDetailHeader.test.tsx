import {
  CredentialPlatform,
  PageScope,
  PostStatus,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    ({
      askAgent: 'Ask Agent',
      delete: 'Delete',
      edit: 'Edit',
      expandingToThread: 'Expanding…',
      expandToThread: 'Expand to Thread',
      performance: 'Performance',
      preview: 'Preview',
      publishing: 'Publishing…',
      publishNow: 'Publish now',
      remix: 'Remix',
      repurpose: 'Repurpose',
      schedule: 'Schedule',
      scheduling: 'Scheduling…',
      threadLengthOption: `${values?.count} tweets`,
      threadLengthPrompt: 'Select thread length',
      viewLivePost: 'View live post',
    })[key] ?? key,
}));

// The overflow menu's real Radix internals need pointer events jsdom does not
// implement; flatten it like the other collection-actions consumers do so
// these tests assert the header's actions, not Radix's positioning.
vi.mock('@ui/collection/CollectionItemActions', () => ({
  default: ({
    primary,
    overflow,
  }: {
    primary?: ReactNode;
    overflow: Array<{
      id: string;
      label: string;
      href?: string;
      isDestructive?: boolean;
      isDisabled?: boolean;
      onSelect?: () => void;
    }>;
  }) => (
    <div>
      {primary}
      {overflow.map((action) =>
        action.href ? (
          <a href={action.href} key={action.id}>
            {action.label}
          </a>
        ) : (
          <button
            data-destructive={action.isDestructive || undefined}
            disabled={action.isDisabled}
            key={action.id}
            onClick={action.onSelect}
            type="button"
          >
            {action.label}
          </button>
        ),
      )}
    </div>
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
  const onPublishNow = vi.fn();
  const onScheduleSave = vi.fn();

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
      onPublishNow={onPublishNow}
      onScheduleSave={onScheduleSave}
      {...props}
    />,
  );

  return {
    onCreateRemix,
    onDelete,
    onExpandToThread,
    onPublishNow,
    onScheduleSave,
    onViewModeChange,
  };
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

  it('shows exactly one primary button: Publish now for an unscheduled draft', () => {
    renderHeader();

    expect(
      screen.getByRole('button', { name: 'Publish now' }),
    ).toBeInTheDocument();
  });

  it('switches the primary action to Schedule once the schedule draft is dirty', async () => {
    const user = userEvent.setup();
    const { onScheduleSave, onPublishNow } = renderHeader(
      {},
      { isScheduleDirty: true },
    );

    expect(
      screen.queryByRole('button', { name: 'Publish now' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onScheduleSave).toHaveBeenCalledTimes(1);
    expect(onPublishNow).not.toHaveBeenCalled();
  });

  it('carries no primary action once the post is published', () => {
    renderHeader({}, { isPublished: true });

    expect(
      screen.queryByRole('button', { name: 'Publish now' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Schedule' }),
    ).not.toBeInTheDocument();
  });

  it('moves edit-only controls into the overflow menu', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: 'Delete' });
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveAttribute('data-destructive', 'true');
  });

  it('hides edit-only controls once the post is published', () => {
    renderHeader({}, { isPublished: true });

    expect(
      screen.queryByRole('button', { name: 'Delete' }),
    ).not.toBeInTheDocument();
  });

  it('toggles the view mode from the overflow menu', async () => {
    const user = userEvent.setup();
    const { onViewModeChange } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(onViewModeChange).toHaveBeenCalledWith('preview');
  });

  it('calls onDelete when the overflow delete action is pressed', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderHeader();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers expand-to-thread from the overflow for an editable twitter post without children', () => {
    renderHeader();

    expect(
      screen.getByRole('button', { name: 'Expand to Thread' }),
    ).toBeInTheDocument();
  });

  it('hides expand-to-thread once the post already has children', () => {
    renderHeader({}, { hasChildren: true });

    expect(
      screen.queryByRole('button', { name: 'Expand to Thread' }),
    ).not.toBeInTheDocument();
  });

  it('lists a live post link in the overflow when the platform url is present', () => {
    renderHeader({ platformUrl: 'https://x.com/post/1' });

    expect(
      screen.getByRole('link', { name: 'View live post' }),
    ).toHaveAttribute('href', 'https://x.com/post/1');
  });

  it('offers remix, performance and agent links for public posts', () => {
    renderHeader({ status: PostStatus.PUBLIC }, { isPublished: true });

    expect(screen.getByRole('button', { name: 'Remix' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Performance' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ask Agent' })).toBeInTheDocument();
  });
});
