import '@testing-library/jest-dom/vitest';
import type { Post } from '@models/content/post.model';
import BrandTopPostsTable from '@pages/analytics/brand-overview/BrandTopPostsTable';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img {...props} alt={props.alt || ''} />
  ),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

const post = {
  description: '<p>Launch <b>day</b> recap</p>',
  id: 'post-7',
  ingredients: [],
  platform: 'twitter',
  publishedAt: '2026-03-10T10:00:00.000Z',
} as unknown as Post;

function renderTable(onSelectPost = vi.fn()) {
  render(
    <BrandTopPostsTable
      formatDate={(value) => value}
      isLoadingPosts={false}
      onSelectPost={onSelectPost}
      topPosts={[post]}
    />,
  );
  return onSelectPost;
}

describe('BrandTopPostsTable', () => {
  it('opens the post in the sidebar from the row and links the name to the page', () => {
    const onSelectPost = renderTable();

    expect(
      screen.getByRole('link', { name: 'Launch day recap' }),
    ).toHaveAttribute('href', '/acme/moonrise/publishing/posts/post-7');

    fireEvent.click(screen.getByRole('link', { name: 'Launch day recap' }));
    expect(onSelectPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('2026-03-10T10:00:00.000Z'));
    expect(onSelectPost).toHaveBeenCalledWith('post-7');
  });
});
