import TrendsList from '@pages/trends/list/trends-list';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTrendContent = vi.fn();
const mockUseQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/discovery/overview');

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/trends/use-trend-content/use-trend-content', () => ({
  useTrendContent: (...args: unknown[]) => mockUseTrendContent(...args),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/org-1/brand-1${path}`,
    orgHref: (path: string) => path,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock('@services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand-1', orgSlug: 'org-1' }),
  usePathname: (...args: unknown[]) => mockUsePathname(...args),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
  })),
  useSearchParams: vi.fn(() => ({
    toString: () => '',
  })),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    ...props
  }: {
    children: ReactNode;
    href: string;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
}));

describe('TrendsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/discovery/overview');

    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [
        {
          authorHandle: 'builderx',
          contentRank: 1,
          contentType: 'tweet',
          id: 'twitter-source-1',
          matchedTrends: ['#AIAgents'],
          metrics: {
            likes: 120,
          },
          platform: 'twitter',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://x.com/builderx/status/1',
          text: 'AI agents are getting embedded directly into content workflows.',
          title:
            'AI agents are getting embedded directly into content workflows',
          trendId: 'twitter-1',
          trendMentions: 20000,
          trendTopic: '#AIAgents',
          trendViralityScore: 90,
        },
        {
          authorHandle: 'operator',
          contentRank: 2,
          contentType: 'tweet',
          id: 'twitter-source-2',
          matchedTrends: ['#AIWorkflows'],
          platform: 'twitter',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://x.com/operator/status/2',
          text: 'Workflow orchestration is becoming the default AI app pattern.',
          title:
            'Workflow orchestration is becoming the default AI app pattern',
          trendId: 'twitter-2',
          trendMentions: 18000,
          trendTopic: '#AIWorkflows',
          trendViralityScore: 82,
        },
        {
          authorHandle: 'shortmaker',
          contentRank: 3,
          contentType: 'video',
          id: 'tiktok-source-1',
          matchedTrends: ['#ShortFormAI'],
          platform: 'tiktok',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://tiktok.com/@shortmaker/video/1',
          text: 'Short-form explainers on AI tools are spiking.',
          title: 'Short-form explainers on AI tools are spiking',
          trendId: 'tiktok-1',
          trendMentions: 22000,
          trendTopic: '#ShortFormAI',
          trendViralityScore: 87,
        },
      ],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: ['twitter', 'linkedin'],
        lockedPlatforms: ['tiktok'],
        totalItems: 3,
        totalTrends: 3,
      },
    });

    mockUseQuery.mockReturnValue({
      data: [
        {
          creatorHandle: 'creator',
          externalId: '7123456789012345678',
          id: 'video-1',
          platform: 'tiktok',
          title: 'Viral hook',
          videoUrl: 'https://www.tiktok.com/@creator/video/7123456789012345678',
          views: 15000,
          viralScore: 88,
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it('does not render platform pills in the topbar (platforms live in sidebar menu)', () => {
    render(<TrendsList />);

    expect(
      screen.queryByTestId('socials-platform-filter'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'LinkedIn' }),
    ).not.toBeInTheDocument();
  });

  it('renders actual content cards instead of topic-only trend cards', () => {
    render(<TrendsList />);

    expect(
      screen.getByText(
        'AI agents are getting embedded directly into content workflows',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Workflow orchestration is becoming the default AI app pattern',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Short-form explainers on AI tools are spiking'),
    ).toBeInTheDocument();
    expect(screen.getByText('#AIAgents')).toBeInTheDocument();
  });

  it('renders summary stats bar', () => {
    render(<TrendsList />);

    expect(screen.getByText(/Total posts/i)).toBeInTheDocument();
    expect(screen.getByText(/Trend topics/i)).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders structured cards, table headers, and panel empty states when discovery has no data', () => {
    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: ['instagram', 'tiktok'],
        totalItems: 0,
        totalTrends: 0,
      },
    });
    mockUseQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<TrendsList />);

    expect(screen.getByText('Source coverage')).toBeInTheDocument();
    expect(screen.getByText('Locked sources')).toBeInTheDocument();
    expect(screen.getByText('Feed state')).toBeInTheDocument();
    expect(
      screen.getByText('Warm this workspace with real sources'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Connect accounts/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Follow creators/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Refresh' }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('No viral videos yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh videos' }),
    ).toBeInTheDocument();
  });

  it('renders the search bar in the section topbar actions, not the body', () => {
    render(<TrendsList />);

    const topbar = screen.getByTestId('section-topbar');
    const search = screen.getByPlaceholderText('Search trending content');

    expect(topbar).toContainElement(search);
  });

  it('renders the viral videos section below the grid', () => {
    render(<TrendsList />);

    expect(screen.getByText('Viral Videos')).toBeInTheDocument();
    expect(screen.getByText('Viral hook')).toBeInTheDocument();
    expect(screen.getByTitle('Viral hook video')).toHaveAttribute(
      'src',
      'https://www.tiktok.com/player/v1/7123456789012345678?autoplay=0&loop=0&muted=0',
    );
  });

  it('shows the loading state while the feed loads', () => {
    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: true,
      isRefreshing: false,
      items: [],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: [],
        totalItems: 0,
        totalTrends: 0,
      },
    });
    render(<TrendsList />);

    expect(screen.getByText('Loading content feed…')).toBeInTheDocument();
  });

  it('shows the error alert and retries the feed', () => {
    const refreshTrendContent = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseTrendContent.mockReturnValue({
      error: new Error('boom'),
      isLoading: false,
      isRefreshing: false,
      items: [],
      refreshTrendContent,
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: [],
        totalItems: 0,
        totalTrends: 0,
      },
    });
    mockUseQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch,
    });
    render(<TrendsList />);

    expect(
      screen.getByText('Failed to load the content feed'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refreshTrendContent).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  it('filters the feed by search and clears a no-match search', () => {
    render(<TrendsList />);

    const search = screen.getByPlaceholderText('Search trending content');
    fireEvent.change(search, { target: { value: 'orchestration' } });

    expect(
      screen.getByText(
        'Workflow orchestration is becoming the default AI app pattern',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Short-form explainers on AI tools are spiking'),
    ).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText('No matching trend content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(
      screen.getByText('Short-form explainers on AI tools are spiking'),
    ).toBeInTheDocument();
  });

  it('refreshes the feed and videos from the topbar refresh button', () => {
    const refreshTrendContent = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseTrendContent.mockReturnValue({
      ...mockUseTrendContent(),
      refreshTrendContent,
    });
    mockUseQuery.mockReturnValue({
      ...mockUseQuery(),
      refetch,
    });
    render(<TrendsList />);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refreshTrendContent).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  it('renders the section topbar with title and search actions', () => {
    render(<TrendsList />);

    const topbar = screen.getByTestId('section-topbar');

    expect(topbar).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Trending Content' }),
    );
    expect(topbar).toContainElement(
      screen.getByPlaceholderText('Search trending content'),
    );
    expect(
      screen.queryByTestId('socials-platform-filter'),
    ).not.toBeInTheDocument();
  });
});
