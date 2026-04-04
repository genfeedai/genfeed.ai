import TrendsList from '@pages/trends/list/trends-list';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseTrendContent = vi.fn();
const mockUseResource = vi.fn();
const mockUsePathname = vi.fn(() => '/research/socials');

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@hooks/data/trends/use-trend-content/use-trend-content', () => ({
  useTrendContent: (...args: unknown[]) => mockUseTrendContent(...args),
}));

vi.mock('@hooks/data/resource/use-resource/use-resource', () => ({
  useResource: (...args: unknown[]) => mockUseResource(...args),
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

    mockUseResource.mockReturnValue({
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
      refresh: vi.fn(),
    });
  });

  it('renders the overview tab as active with platform tabs', () => {
    render(<TrendsList />);

    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/research/socials',
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByRole('tab', { name: 'X' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'LinkedIn' })).toBeInTheDocument();
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

    expect(screen.getByText('Total Posts')).toBeInTheDocument();
    expect(screen.getByText('Trend Topics')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
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

  it('renders socials platform tab links', () => {
    render(<TrendsList />);

    expect(screen.getByRole('tab', { name: 'X' })).toHaveAttribute(
      'href',
      '/research/twitter',
    );
    expect(screen.getByRole('tab', { name: 'LinkedIn' })).toHaveAttribute(
      'href',
      '/research/linkedin',
    );
  });
});
