import { PageScope, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { buildPostsTableColumns } from './PostsTableColumns';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

function renderStatus(post: Partial<IPost>) {
  const column = buildPostsTableColumns({
    browserTimezone: 'UTC',
    hasPublicPosts: false,
    onEvaluated: vi.fn(),
    onOpenIngredient: vi.fn(),
    onStatusChanged: vi.fn(),
    scope: PageScope.PUBLISHING,
  }).find((item) => item.key === 'status');

  return render(<>{column?.render(post as IPost)}</>);
}

describe('buildPostsTableColumns status', () => {
  it('shows only the Failed badge and keeps the reason in its tooltip', async () => {
    renderStatus({
      status: PostStatus.FAILED,
      targetError: { message: 'Daily Inbox quota reached' },
    } as Partial<IPost>);

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(
      screen.queryByText('Daily Inbox quota reached'),
    ).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText('failed'));

    expect(
      (await screen.findAllByText('Daily Inbox quota reached')).length,
    ).toBeGreaterThan(0);
  });

  it('shows a Delivered badge for an Inbox receipt', () => {
    renderStatus({ isInboxDelivery: true, status: PostStatus.PUBLIC });

    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });
});
