import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsOverviewPerformanceDataset from './analytics-overview-performance-dataset';

const requestState = vi.hoisted(() => ({
  summary: null as Record<string, unknown> | null,
}));
const mocks = vi.hoisted(() => ({
  getWeeklySummary: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('pages.analytics.performanceDataset');
  return { useTranslations: () => translate };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/acme/brand${path}`,
  }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isCollectionFetchReady: () => true,
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
}));

const getService = async () => ({
  getWeeklySummary: mocks.getWeeklySummary.mockImplementation(() =>
    Promise.resolve(requestState.summary),
  ),
});

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => getService,
}));

vi.mock('@services/analytics/content-performance.service', () => ({
  ContentPerformanceService: class ContentPerformanceService {},
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    avgEngagementByContentType: [],
    avgEngagementByPlatform: [],
    bestPostingTimes: [],
    dataset: {
      confidence: 'low',
      genfeedPosts: 2,
      importedPosts: 3,
      totalPosts: 5,
    },
    topHooks: [],
    topPerformers: [],
    weekOverWeekTrend: {
      currentEngagement: 0,
      direction: 'stable',
      percentageChange: 0,
      previousEngagement: 0,
    },
    worstPerformers: [],
    ...overrides,
  };
}

describe('AnalyticsOverviewPerformanceDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestState.summary = null;
  });

  it('renders nothing while there is no summary yet', () => {
    requestState.summary = null;
    const { container } = render(<AnalyticsOverviewPerformanceDataset />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the dataset line and confidence badge', async () => {
    requestState.summary = buildSummary();
    render(<AnalyticsOverviewPerformanceDataset />);

    expect(
      await screen.findByText(
        'Based on 5 posts in the last 7 days · 3 imported from your connected accounts',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Low confidence')).toBeInTheDocument();
  });

  it('shows the cold-start hint and settings link for low confidence', async () => {
    requestState.summary = buildSummary({
      dataset: {
        confidence: 'none',
        genfeedPosts: 0,
        importedPosts: 0,
        totalPosts: 0,
      },
    });
    render(<AnalyticsOverviewPerformanceDataset />);

    const link = await screen.findByRole('link', {
      name: 'Connect more accounts',
    });
    expect(link).toHaveAttribute('href', '/acme/brand/settings/integrations');
  });

  it('does not show the cold-start hint for high confidence', async () => {
    requestState.summary = buildSummary({
      dataset: {
        confidence: 'high',
        genfeedPosts: 30,
        importedPosts: 10,
        totalPosts: 40,
      },
    });
    render(<AnalyticsOverviewPerformanceDataset />);

    await screen.findByText('High confidence');
    expect(
      screen.queryByRole('link', { name: 'Connect more accounts' }),
    ).toBeNull();
  });

  it('marks imported top performers without linking to a Genfeed post', async () => {
    requestState.summary = buildSummary({
      topPerformers: [
        {
          comments: 0,
          description: 'An imported post',
          engagementRate: 4.2,
          likes: 0,
          origin: 'imported',
          platform: 'instagram',
          postId: 'source-1',
          saves: 0,
          shares: 0,
          sourcePostId: 'source-1',
          title: 'Imported win',
          views: 100,
        },
        {
          comments: 0,
          description: 'A genfeed post',
          engagementRate: 3.1,
          likes: 0,
          origin: 'genfeed',
          platform: 'tiktok',
          postId: 'post-1',
          saves: 0,
          shares: 0,
          title: 'Genfeed win',
          views: 80,
        },
      ],
    });
    render(<AnalyticsOverviewPerformanceDataset />);

    await screen.findByText('Genfeed win');
    expect(screen.getByText('Imported win')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Imported win/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Genfeed win' })).toHaveAttribute(
      'href',
      '/acme/brand/publishing/posts/post-1',
    );
  });
});
