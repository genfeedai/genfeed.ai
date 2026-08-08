import '@testing-library/jest-dom/vitest';
import { ArticleCategory, Platform, PostStatus } from '@genfeedai/enums';
import PublishContentLibrary from '@pages/posts/library/publish-content-library';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/acme/main${path}` }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: collections,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/main/publish/posts',
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    items,
    onRowClick,
  }: {
    items: Array<{ id: string; title: string; type: string }>;
    onRowClick: (item: { id: string; title: string; type: string }) => void;
  }) => (
    <div>
      {items.map((item) => (
        <button
          key={`${item.type}:${item.id}`}
          type="button"
          onClick={() => onRowClick(item)}
        >
          {item.title}
        </button>
      ))}
    </div>
  ),
}));

describe('PublishContentLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search = '';
  });

  it('renders the federated rows and registers the filter toolbar', async () => {
    render(<PublishContentLibrary />);

    expect(screen.getByRole('button', { name: 'Social launch copy' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Launch guide' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Founder weekly' })).toBeVisible();
    expect(screen.getByText('3 items')).toBeVisible();

    await waitFor(() => expect(mocks.setFiltersNode).toHaveBeenCalled());
  });

  it.each([
    ['post-1', 'post', '/publish/posts/post-1'],
    ['article-1', 'article', '/edit/article/article-1'],
    ['newsletter-1', 'newsletter', '/edit/newsletter/newsletter-1'],
  ])('opens %s through the canonical %s editor route', (id, _type, route) => {
    render(<PublishContentLibrary />);

    const item = Object.values(collections)
      .flat()
      .find((candidate) => candidate.id === id);
    fireEvent.click(screen.getByRole('button', { name: item?.label || item?.description }));

    expect(mocks.push).toHaveBeenCalledWith(
      `/acme/main${route}?returnTo=%2Facme%2Fmain%2Fpublish%2Fposts`,
    );
  });

  it('shows the combination empty state when URL filters match no rows', () => {
    mocks.search = 'type=newsletter&platform=email&status=published';

    render(<PublishContentLibrary />);

    expect(screen.getByText('0 items')).toBeVisible();
  });
});
