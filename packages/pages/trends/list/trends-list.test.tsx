import TrendsList from '@pages/trends/list/trends-list';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTrendContent = vi.fn();
const mockUseQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/research/socials');

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/trends/use-trend-content/use-trend-content', () => ({
  useTrendContent: (...args: unknown[]) => mockUseTrendContent(...args),
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
    mockUsePathname.mockReturnValue('/research/socials');

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
          id: 'video-1',
          platform: 'tiktok',
          title: 'Viral hook',
          views: 15000,
          viralScore: 88,
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it('renders the overview tab as active with platform tabs', () => {
    render(<TrendsList />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/research/socials',
    );
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('link', { name: 'X' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
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
      screen.getByText('No remixable trend content yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Source' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toHaveClass(
      'text-foreground/72',
    );
    expect(
      screen.getByRole('columnheader', { name: 'Content' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh feed' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Hook pattern')).toBeInTheDocument();
    expect(screen.getByText('Creator format')).toBeInTheDocument();
    expect(screen.getByText('Remix angle')).toBeInTheDocument();
  });

  it('renders the search bar', () => {
    render(<TrendsList />);

    expect(
      screen.getByPlaceholderText('Search trending content'),
    ).toBeInTheDocument();
  });

  it('renders the viral videos section below the grid', () => {
    render(<TrendsList />);

    expect(screen.getByText('Viral Videos')).toBeInTheDocument();
    expect(screen.getByText('Viral hook')).toBeInTheDocument();
  });

  it('renders the section topbar with the title and tabs inside the bordered bar', () => {
    render(<TrendsList />);

    const topbar = screen.getByTestId('section-topbar');

    expect(topbar).toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Trending Content' }),
    );
    expect(topbar).toContainElement(
      screen.getByRole('link', { name: 'Overview' }),
    );
  });

  it('renders socials platform tab links', () => {
    render(<TrendsList />);

    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      '/research/twitter',
    );
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/research/linkedin',
    );
  });
});
