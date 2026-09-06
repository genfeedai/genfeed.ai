import '@testing-library/jest-dom/vitest';
import { ArticleCategory, Platform, PostStatus } from '@genfeedai/contracts';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryData: null as unknown,
  push: vi.fn(),
  replace: vi.fn(),
  search: '',
  setFiltersNode: vi.fn(),
  setIsRefreshing: vi.fn(),
  setRefresh: vi.fn(),
  setViewToggleNode: vi.fn(),
}));

const collections = {
  articles: [
    {
      category: ArticleCategory.TUTORIAL,
      createdAt: '2026-08-07T10:00:00.000Z',
      id: 'article-1',
      label: 'Launch guide',
      status: 'PUBLISHED',
      summary: 'Long-form launch plan',
    },
  ],
  newsletters: [
    {
      createdAt: '2026-08-06T10:00:00.000Z',
      id: 'newsletter-1',
      label: 'Founder weekly',
      status: 'ready_for_review',
      summary: 'This week in operations',
      topic: 'Operations',
    },
  ],
  posts: [
    {
      createdAt: '2026-08-08T10:00:00.000Z',
      description: 'Social launch copy',
      id: 'post-1',
      platform: Platform.INSTAGRAM,
      status: PostStatus.SCHEDULED,
    },
  ],
};

vi.mock('@pages/posts/release/release-detail-drawer', () => ({
  default: () => null,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
  }),
}));

vi.mock('@contexts/posts/posts-layout-context', () => ({
  usePostsLayout: () => ({
    setFiltersNode: mocks.setFiltersNode,
    setIsRefreshing: mocks.setIsRefreshing,
    setRefresh: mocks.setRefresh,
    setViewToggleNode: mocks.setViewToggleNode,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: mocks.queryData,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/publishing/posts',
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

describe('PublishingContentLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryData = collections;
    mocks.search = '';
  });

  it('renders the federated rows and registers the filter toolbar', async () => {
    render(<PublishingContentLibrary />);

    expect(
      screen.getByRole('link', { name: 'Open Social launch copy' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Launch guide' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open Founder weekly' }),
    ).toBeVisible();
    expect(screen.getByText('3 posts')).toBeVisible();

    await waitFor(() => expect(mocks.setFiltersNode).toHaveBeenCalled());
  });

  it.each([
    ['Social launch copy', '/publishing/posts/post-1'],
    ['Launch guide', '/publishing/posts/article-1'],
    ['Founder weekly', '/publishing/posts/newsletter-1'],
  ])('opens %s through its canonical editor route', (title, route) => {
    render(<PublishingContentLibrary />);

    expect(screen.getByRole('link', { name: `Open ${title}` })).toHaveAttribute(
      'href',
      `/acme/main${route}`,
    );
  });

  it('links to the approval queue and carries the selected batch and item', async () => {
    mocks.search = 'batch=batch-1&item=item-9&status=draft';

    render(<PublishingContentLibrary />);

    await waitFor(() => expect(mocks.setFiltersNode).toHaveBeenCalled());
    const [toolbar] = mocks.setFiltersNode.mock.calls.at(-1) ?? [];
    render(<>{toolbar}</>);

    expect(screen.getByRole('link', { name: 'approvalQueue' })).toHaveAttribute(
      'href',
      '/acme/main/publishing/review?batch=batch-1&item=item-9',
    );
  });

  it('combines multiple statuses with the content type', () => {
    mocks.search = 'status=published&status=draft&type=article';
    render(<PublishingContentLibrary />);
    expect(
      screen.getByRole('link', { name: 'Open Launch guide' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open Founder weekly' }),
    ).not.toBeInTheDocument();
  });

  it('retains the view selector around calendar content', () => {
    mocks.search = 'view=calendar';
    render(<PublishingContentLibrary calendar={<div>Calendar content</div>} />);
    expect(screen.getByText('Calendar content')).toBeVisible();
    expect(mocks.setViewToggleNode).toHaveBeenCalled();
  });

  it('shows the combination empty state when URL filters match no rows', () => {
    mocks.search = 'type=newsletter&platform=email&status=published';

    render(<PublishingContentLibrary />);

    expect(screen.getByText('0 posts')).toBeVisible();
    expect(screen.getByText('No matching posts')).toBeVisible();
    expect(
      screen.getByText(
        'Try a different type, channel, lifecycle status, or search.',
      ),
    ).toBeVisible();
  });

  it('shows a distinct empty state when the library has no content', () => {
    mocks.queryData = {
      articles: [],
      newsletters: [],
      posts: [],
    };

    render(<PublishingContentLibrary />);

    expect(screen.getByText('No posts yet')).toBeVisible();
    expect(
      screen.getByText(
        'Posts, articles, and newsletters will appear here as you create them.',
      ),
    ).toBeVisible();
  });
});
