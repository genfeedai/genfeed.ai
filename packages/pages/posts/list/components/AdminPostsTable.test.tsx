import '@testing-library/jest-dom/vitest';
import { Platform, PostStatus } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import AdminPostsTable from '@pages/posts/list/components/AdminPostsTable';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    unoptimized?: boolean;
  }) => <img {...props} alt={props.alt || ''} />,
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    brand: { label: 'Demo brand' },
    description: '<p>Launch teaser, cut 2</p>',
    id: 'post-1',
    ingredients: [],
    organization: { label: 'Genfeed.ai' },
    platform: Platform.INSTAGRAM,
    status: PostStatus.SCHEDULED,
    user: { email: 'vincent@genfeed.ai' },
    ...overrides,
  } as unknown as IPost;
}

describe('AdminPostsTable', () => {
  it('shows the post, its owner, platform and a status badge', () => {
    render(
      <AdminPostsTable posts={[buildPost()]} onOpenPostDetail={vi.fn()} />,
    );

    expect(screen.getByText('Launch teaser, cut 2')).toBeInTheDocument();
    expect(
      screen.getByText('Genfeed.ai · Demo brand · vincent@genfeed.ai'),
    ).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('opens the post detail on a row click instead of linking to the account', () => {
    const onOpenPostDetail = vi.fn();
    render(
      <AdminPostsTable
        posts={[buildPost({ label: 'Weekly product update' })]}
        onOpenPostDetail={onOpenPostDetail}
      />,
    );

    fireEvent.click(screen.getByText('Weekly product update'));

    expect(onOpenPostDetail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'post-1' }),
    );
    expect(
      screen.queryByRole('link', { name: /weekly product update/i }),
    ).toBeNull();
  });

  it('links a posted row to the live post on its network', () => {
    render(
      <AdminPostsTable
        posts={[
          buildPost({
            platformUrl: 'https://instagram.com/p/abc',
            status: PostStatus.PUBLIC,
          }),
        ]}
        onOpenPostDetail={vi.fn()}
      />,
    );

    const row = screen.getByText('Posted').closest('tr') as HTMLElement;
    expect(
      within(row).getByRole('link', { name: /view on instagram/i }),
    ).toHaveAttribute('href', 'https://instagram.com/p/abc');
  });

  it('shows the failure reason under a failed badge', () => {
    render(
      <AdminPostsTable
        posts={[
          buildPost({
            status: PostStatus.FAILED,
            targetError: { message: 'Token expired' },
          } as Partial<IPost>),
        ]}
        onOpenPostDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Token expired')).toBeInTheDocument();
  });
});
