import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import type { AnalyticsQueryFilters } from '@genfeedai/contracts/interfaces';
import AnalyticsPostsList from '@/features/analytics/posts-list/analytics-posts-list';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useTopPostsMock = vi.fn();
const useWinnerPostsMock = vi.fn();
const openRemixMock = vi.fn();

function ToolbarHost() {
  const { searchNode, toolbarNode } = useAnalyticsContext();
  return (
    <>
      {searchNode}
      {toolbarNode}
    </>
  );
}

function renderPostsList(restoredFilters?: AnalyticsQueryFilters) {
  return render(
    <AnalyticsProvider restoredFilters={restoredFilters}>
      <ToolbarHost />
      <AnalyticsPostsList />
    </AnalyticsProvider>,
  );
}

vi.mock('@hooks/data/analytics/use-top-posts/use-top-posts', () => ({
  useTopPosts: (...args: unknown[]) => useTopPostsMock(...args),
}));

vi.mock('@/features/analytics/hooks/use-winner-posts/use-winner-posts', () => ({
  useWinnerPosts: (...args: unknown[]) => useWinnerPostsMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: pushMock,
    replace: replaceMock,
  })),
  usePathname: vi.fn(() => '/acme/moonrise/analytics/posts'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@ui/content/filter-menu/FilterMenu', () => ({
  default: ({
    facets,
  }: {
    facets: Array<{
      label: string;
      options: Array<{ label: string; value: string }>;
      value: string;
    }>;
  }) => (
    <div data-testid="filter-menu">
      {facets.map((facet) => (
        <div key={facet.label} role="group" aria-label={facet.label}>
          {facet.options.map((option) => (
            <span
              key={option.value}
              data-selected={option.value === facet.value}
            >
              {option.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/features/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: openRemixMock }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/moonrise${path}`,
  }),
}));

vi.mock('@/features/posts/detail/PostDetailPanel', () => ({
  __esModule: true,
  default: ({ postId }: { postId: string | null }) => (
    <div data-testid="post-detail-overlay">{postId ?? 'closed'}</div>
  ),
}));

describe('AnalyticsPostsList', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
    useTopPostsMock.mockReset();
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [],
    });
    openRemixMock.mockReset();
    useWinnerPostsMock.mockReset();
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [],
    });
  });

  it('labels imports and hides unavailable metric numbers in the all-sources view', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          postId: 'imported',
          label: 'LinkedIn article',
          platform: 'linkedin',
          brandName: 'Acme',
          source: 'extension',
          metricsStatus: 'unavailable',
          totalViews: 0,
          totalEngagement: 0,
          engagementRate: 0,
        },
      ],
    });
    renderPostsList();
    const card = screen.getByTestId('analytics-post-card');
    expect(within(card).getByText('Imported')).toBeInTheDocument();
    expect(within(card).getByText('Metrics unavailable')).toBeInTheDocument();
    expect(within(card).queryByText('0.00%')).not.toBeInTheDocument();
  });

  it('renders every filter through the shared filter menu', () => {
    renderPostsList();

    const searchInput = screen.getByPlaceholderText('Search posts...');
    expect(searchInput).toHaveAttribute('name', 'search');
    // The search is a persistent field and holds the Filters menu inside it.
    expect(
      within(
        searchInput.parentElement?.parentElement as HTMLElement,
      ).getByTestId('filter-menu'),
    ).toBeInTheDocument();

    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getAllByTestId('filter-menu')).toHaveLength(1);
    for (const name of ['Show posts', 'Rank by', 'Platform', 'Source']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('All Platforms')).not.toBeInTheDocument();
  });

  it('does not scope top posts to a source or show an audience column by default', () => {
    renderPostsList();

    expect(useTopPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: undefined }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Source' })).getByText(
        'All sources',
      ),
    ).toHaveAttribute('data-selected', 'true');
    expect(screen.queryByText('Audience')).not.toBeInTheDocument();
  });

  it('scopes top posts to extension captures and shows each observed audience', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 1,
          label: 'Private capture',
          platform: 'twitter',
          postId: 'post-private',
          totalEngagement: 3,
          totalViews: 30,
          visibility: 'private',
        },
        {
          brandName: 'Acme',
          engagementRate: 1,
          label: 'Capture with no audience',
          platform: 'twitter',
          postId: 'post-unknown',
          totalEngagement: 1,
          totalViews: 10,
          visibility: null,
        },
      ],
    });

    renderPostsList({ source: 'extension' });

    expect(useTopPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'extension' }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Source' })).getByText(
        'Imported',
      ),
    ).toHaveAttribute('data-selected', 'true');
    expect(screen.getAllByText('Audience')).toHaveLength(2);
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Audience unavailable')).toBeInTheDocument();
  });

  it('ignores a restored source in the Winners view, which has no source scope', () => {
    renderPostsList({ show: 'winners', source: 'extension' });

    expect(useTopPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: undefined }),
    );
    expect(
      screen.queryByRole('group', { name: 'Source' }),
    ).not.toBeInTheDocument();
  });

  it('keeps winners off until the Winners view is chosen', () => {
    renderPostsList();

    expect(useWinnerPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: false }),
    );
    expect(screen.getByText('All posts')).toBeInTheDocument();
  });

  it('shows each winner with the evidence that qualified it', () => {
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [
        {
          brandId: 'brand-1',
          brandName: 'Acme',
          contentType: 'video',
          description: null,
          engagementRate: 2,
          evidence: [
            {
              baseline: 10,
              ratio: 6,
              sampleSize: 8,
              signal: 'comments',
              tier: 'outlier',
              value: 60,
            },
          ],
          label: 'Launch reel',
          platform: 'instagram',
          postId: 'post-9',
          publishedAt: '2026-10-01T00:00:00.000Z',
          totalComments: 60,
          totalLikes: 100,
          totalViews: 1000,
        },
      ],
    });

    renderPostsList({ show: 'winners' });

    expect(useWinnerPostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true }),
    );
    expect(screen.getByText('Winners')).toBeInTheDocument();
    expect(screen.getByText('Outlier')).toBeInTheDocument();
    expect(
      screen.getByText('Comments 6.0× baseline (60 vs 10, 8 posts)'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Rank by' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Launch reel'));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-9',
    );
  });

  it('offers a remix of each winner without opening its detail', () => {
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [
        {
          brandId: 'brand-1',
          brandName: 'Acme',
          contentType: 'text',
          description: null,
          engagementRate: 2,
          evidence: [
            {
              baseline: 100,
              ratio: 9,
              sampleSize: 30,
              signal: 'views',
              tier: 'breakout',
              value: 900,
            },
          ],
          label: 'Hot take',
          platform: 'twitter',
          postId: 'post-x1',
          publishedAt: '2026-10-01T00:00:00.000Z',
          totalComments: 4,
          totalLikes: 40,
          totalViews: 900,
        },
      ],
    });

    renderPostsList({ show: 'winners' });

    fireEvent.click(screen.getByRole('button', { name: 'Remix this winner' }));

    expect(openRemixMock).toHaveBeenCalledWith({
      kind: 'owned_post',
      postId: 'post-x1',
    });
    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'closed',
    );
  });

  it('explains why there are no winners instead of labelling thin data', () => {
    renderPostsList({ show: 'winners' });

    expect(
      screen.getByText(/A post wins when a metric beats its account/),
    ).toBeInTheDocument();
  });

  it('opens the shared post detail overlay from a post card', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 4.2,
          platform: 'twitter',
          postId: 'post-3',
          totalEngagement: 250,
          totalViews: 1200,
        },
      ],
    });

    renderPostsList();

    fireEvent.click(screen.getByText('X'));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-3',
    );
  });

  it('keeps the subbar to one compact row without the Open In Agent filler', () => {
    renderPostsList();

    expect(
      screen.queryByRole('button', { name: 'Open In Agent' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('filter-menu')).toHaveLength(1);
  });

  it('links the post name to its detail page without opening the sidebar', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 4.2,
          platform: 'twitter',
          postId: 'post-3',
          totalEngagement: 250,
          totalViews: 1200,
        },
      ],
    });

    renderPostsList();

    const link = screen.getByRole('link', { name: 'Untitled Post' });
    expect(link).toHaveAttribute(
      'href',
      '/acme/moonrise/publishing/posts/post-3',
    );

    fireEvent.click(link);

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'closed',
    );
  });

  it('does not add a filler sentence when a post is focused from the loop', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 4.2,
          platform: 'twitter',
          postId: 'post-3',
          totalEngagement: 250,
          totalViews: 1200,
        },
      ],
    });
    renderPostsList();

    fireEvent.click(screen.getByText('X'));

    expect(
      screen.queryByText(/Focused on a single post/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear Focus' })).toBeVisible();
  });

  it('shows posts as ranked cards with their metrics and media', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: [
        {
          brandName: 'Acme',
          engagementRate: 4.256,
          label: 'Launch reel',
          platform: 'instagram',
          postId: 'post-1',
          thumbnailUrl: 'https://cdn.example.com/launch.jpg',
          totalEngagement: 2500,
          totalViews: 1_200_000,
        },
        {
          brandName: 'Acme',
          engagementRate: 1,
          label: 'Text only',
          platform: 'twitter',
          postId: 'post-2',
          totalEngagement: 3,
          totalViews: 30,
        },
      ],
    });

    renderPostsList();

    const cards = screen.getAllByTestId('analytics-post-card');
    expect(cards).toHaveLength(2);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    expect(within(cards[0]).getByText('#1')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Launch reel')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Acme')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Instagram')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Views')).toBeInTheDocument();
    expect(within(cards[0]).getByText('1.2M')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Engagement')).toBeInTheDocument();
    expect(within(cards[0]).getByText('2.5k')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Eng. rate')).toBeInTheDocument();
    expect(within(cards[0]).getByText('4.26%')).toBeInTheDocument();
    expect(
      within(cards[0]).queryByTestId('analytics-post-media-fallback'),
    ).not.toBeInTheDocument();

    // No media: the platform tile stands in for the thumbnail.
    expect(within(cards[1]).getByText('#2')).toBeInTheDocument();
    expect(
      within(cards[1]).getByTestId('analytics-post-media-fallback'),
    ).toBeInTheDocument();
  });

  it('paginates posts client-side and keeps the global rank on later pages', () => {
    useTopPostsMock.mockReturnValue({
      isLoading: false,
      topPosts: Array.from({ length: 30 }, (_, index) => ({
        brandName: 'Acme',
        engagementRate: 1,
        label: `Post ${index + 1}`,
        platform: 'twitter',
        postId: `post-${index + 1}`,
        totalEngagement: 1,
        totalViews: 100 - index,
      })),
    });

    renderPostsList();

    expect(screen.getAllByTestId('analytics-post-card')).toHaveLength(12);
    expect(screen.getByText('30 posts')).toBeInTheDocument();
    expect(screen.getByText('Post 1')).toBeInTheDocument();
    expect(screen.queryByText('Post 13')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '3' }));

    const lastPage = screen.getAllByTestId('analytics-post-card');
    expect(lastPage).toHaveLength(6);
    expect(screen.getByText('Post 25')).toBeInTheDocument();
    expect(screen.getByText('#25')).toBeInTheDocument();
    expect(screen.queryByText('Post 1')).not.toBeInTheDocument();
  });

  it('shows an empty state instead of an empty grid', () => {
    renderPostsList();

    expect(
      screen.getByText('No posts found for this period'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('analytics-post-card')).not.toBeInTheDocument();
  });
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});
