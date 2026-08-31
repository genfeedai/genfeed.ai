import { render, screen } from '@testing-library/react';
import TrendsPlatformDetail from './trends-platform-detail';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTrendContent = vi.fn();
const mockUseQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/discovery/tiktok');

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
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

describe('TrendsPlatformDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/discovery/tiktok');

    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [
        {
          authorHandle: 'viralcreator',
          contentRank: 1,
          contentType: 'video',
          id: 'source-1',
          matchedTrends: ['#AIAgents'],
          platform: 'tiktok',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://example.com/video-1',
          text: 'Three hooks driving the AI agent trend.',
          thumbnailUrl: 'https://example.com/thumb-1.jpg',
          title: 'Three hooks driving the AI agent trend',
          trendId: 'trend-1',
          trendMentions: 22000,
          trendTopic: '#AIAgents',
          trendViralityScore: 91,
        },
        {
          authorHandle: 'builder',
          contentRank: 2,
          contentType: 'video',
          id: 'source-2',
          matchedTrends: ['#AITools'],
          platform: 'tiktok',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceUrl: 'https://example.com/video-2',
          text: 'AI tools people are remixing this week.',
          title: 'AI tools people are remixing this week',
          trendId: 'trend-2',
          trendMentions: 12000,
          trendTopic: '#AITools',
          trendViralityScore: 78,
        },
      ],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: ['tiktok'],
        lockedPlatforms: [],
        totalItems: 2,
        totalTrends: 2,
      },
    });

    mockUseQuery
      .mockReturnValueOnce({
        data: [
          {
            creatorHandle: 'creator',
            id: 'video-1',
            platform: 'tiktok',
            title: 'Viral hook',
            viralScore: 88,
          },
        ],
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [{ hashtag: '#AIAgents', platform: 'tiktok', viralityScore: 70 }],
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      })
      .mockReturnValueOnce({
        data: [
          { soundId: 'sound-1', soundName: 'AI Sound', viralityScore: 75 },
        ],
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      });
  });

  it('renders the full platform feed and supported related sections', () => {
    render(<TrendsPlatformDetail platform="tiktok" />);

    expect(mockUseTrendContent).toHaveBeenCalledWith('tiktok');
    // Discovery: platform destinations are sidebar menu items, not topbar pills.
    expect(
      screen.queryByTestId('socials-platform-filter'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('TikTok Trends')).toBeInTheDocument();
    expect(
      screen.getByText('Three hooks driving the AI agent trend'),
    ).toBeInTheDocument();
    expect(screen.getByText('Related viral videos')).toBeInTheDocument();
    expect(screen.getByText('Trending hashtags')).toBeInTheDocument();
    expect(screen.getByText('Trending sounds')).toBeInTheDocument();
  });

  it('renders LinkedIn through the public-reference feed contract', () => {
    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: ['linkedin'],
        totalItems: 0,
        totalTrends: 1,
      },
    });

    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<TrendsPlatformDetail platform="linkedin" />);

    // Feed type is a MetricCard value now (same hierarchy as Discovery overview).
    expect(screen.getByText('Feed type')).toBeInTheDocument();
    expect(screen.getByText('Public references')).toBeInTheDocument();
    expect(
      screen.queryByText(/LinkedIn topics are curated/i),
    ).not.toBeInTheDocument();
  });

  it('keeps LinkedIn on the public-reference feed when the feed is empty', () => {
    mockUsePathname.mockReturnValue('/discovery/linkedin');

    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: ['linkedin'],
        totalItems: 0,
        totalTrends: 0,
      },
    });

    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<TrendsPlatformDetail platform="linkedin" />);

    expect(screen.getByText('Feed type')).toBeInTheDocument();
    expect(screen.getByText('Public references')).toBeInTheDocument();
    expect(screen.queryByText('Real-time')).not.toBeInTheDocument();
  });

  it('activates the matching platform tab for reference-feed pages too', () => {
    mockUsePathname.mockReturnValue('/discovery/linkedin');

    mockUseTrendContent.mockReturnValue({
      error: null,
      isLoading: false,
      isRefreshing: false,
      items: [],
      refreshTrendContent: vi.fn(),
      summary: {
        connectedPlatforms: [],
        lockedPlatforms: ['linkedin'],
        totalItems: 0,
        totalTrends: 0,
      },
    });

    mockUseQuery.mockReset();
    mockUseQuery.mockReturnValue({
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<TrendsPlatformDetail platform="linkedin" />);

    expect(screen.getByText('LinkedIn Trends')).toBeInTheDocument();
    expect(
      screen.queryByTestId('socials-platform-filter'),
    ).not.toBeInTheDocument();
  });

  it('keeps local platform menu rows on analytics trends routes', () => {
    render(
      <TrendsPlatformDetail basePath="/analytics/trends" platform="twitter" />,
    );

    const filter = screen.getByTestId('socials-platform-filter');
    expect(filter).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'All platforms' })).toHaveAttribute(
      'href',
      '/analytics/trends',
    );
  });
});
