import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import type { AnalyticsQueryFilters } from '@genfeedai/contracts/interfaces';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
const useTopPostsMock = vi.fn();
const useWinnerPostsMock = vi.fn();

function ToolbarHost() {
  const { toolbarNode } = useAnalyticsContext();
  return <>{toolbarNode}</>;
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

vi.mock('@hooks/data/analytics/use-winner-posts/use-winner-posts', () => ({
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

vi.mock('@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu', () => ({
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

vi.mock('@pages/posts/detail/PostDetailPanel', () => ({
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
    useWinnerPostsMock.mockReset();
    useWinnerPostsMock.mockReturnValue({
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      winners: [],
    });
  });

  it('renders every filter through the shared filter menu', () => {
    renderPostsList();

    const searchInput = screen.getByPlaceholderText('Search posts...');
    expect(searchInput).toHaveAttribute('name', 'search');
    expect(searchInput).toHaveClass('border-border');

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
        'Extension',
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

    fireEvent.click(screen.getByText('Untitled Post'));

    expect(screen.getByTestId('post-detail-overlay')).toHaveTextContent(
      'post-3',
    );
  });
  it('keeps the subbar to one compact row without the Open In Agent filler', () => {
    renderPostsList();

    expect(
      screen.queryByRole('button', { name: 'Open In Agent' }),
    ).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search posts...')).toHaveClass('h-8');
    expect(screen.getAllByTestId('filter-menu')).toHaveLength(1);
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

    fireEvent.click(screen.getByText('Untitled Post'));

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
    expect(within(cards[0]).getByText('Acme · instagram')).toBeInTheDocument();
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
