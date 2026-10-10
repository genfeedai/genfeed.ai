import '@testing-library/jest-dom/vitest';
import { PageHelpProvider } from '@genfeedai/contexts/ui/page-help-context';
import { Platform, Timeframe } from '@genfeedai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoveryTrends from './discovery-trends';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  getCorpusFreshnessHealth: vi.fn(),
  getTrendsDiscovery: vi.fn(),
  getTrendingHashtags: vi.fn(),
  getTrendingSounds: vi.fn(),
  getTrendsService: vi.fn(),
  getViralVideos: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ href: (path: string) => `/org-1/brand-1${path}` }),
}));

vi.mock('@hooks/navigation/use-collection-scope/use-collection-scope', () => ({
  isBrandResourceReady: () => true,
  useCollectionScope: () => ({
    brandId: 'brand-1',
    isReady: true,
    organizationId: 'org-1',
    pageScope: 'brand',
  }),
}));

vi.mock('@helpers/formatting/date/date.helper', () => ({
  formatDate: (value: string | Date) => `formatted:${String(value)}`,
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatCompactNumber: (value: number) => `${value}n`,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getTrendsService,
}));

vi.mock('@pages/trends/list/components/HookRemixModal', () => ({
  default: ({
    isOpen,
    onClose,
    video,
  }: {
    isOpen: boolean;
    onClose: () => void;
    video?: { title?: string } | null;
  }) =>
    isOpen ? (
      <section data-testid="remix-modal">
        Remix {video?.title}
        <button type="button" onClick={onClose}>
          Close Remix
        </button>
      </section>
    ) : null,
}));

vi.mock('@services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@ui/analytics/trends', () => ({
  TrendingHashtags: ({
    hashtags,
    onPlatformChange,
    onHashtagClick,
    selectedPlatform,
  }: {
    hashtags: Array<{ hashtag: string }>;
    onPlatformChange: (platform: string) => void;
    onHashtagClick: (hashtag: { hashtag: string }) => void;
    selectedPlatform: string;
  }) => (
    <section>
      <div>Selected hashtag platform: {selectedPlatform || 'all'}</div>
      <button type="button" onClick={() => onPlatformChange('youtube')}>
        Filter YouTube Hashtags
      </button>
      {hashtags.map((hashtag) => (
        <button
          key={hashtag.hashtag}
          type="button"
          onClick={() => onHashtagClick(hashtag)}
        >
          {hashtag.hashtag}
        </button>
      ))}
    </section>
  ),
  TrendingSounds: ({ sounds }: { sounds: Array<{ soundName: string }> }) => (
    <section>
      {sounds.map((sound) => (
        <span key={sound.soundName}>{sound.soundName}</span>
      ))}
    </section>
  ),
}));

vi.mock('@ui/analytics/trends/social-media-player', () => ({
  default: ({ title, sourceUrl }: { title: string; sourceUrl?: string }) => (
    <figure aria-label={title}>
      {sourceUrl ? <a href={sourceUrl}>Open source</a> : null}
    </figure>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    children,
    description,
    headerAction,
    label,
  }: {
    children: ReactNode;
    description?: ReactNode;
    headerAction?: ReactNode;
    label?: string;
  }) => (
    <section>
      {label && <h2>{label}</h2>}
      {description && <p>{description}</p>}
      {headerAction}
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value?: string | number;
  }) => <span>{children ?? value}</span>,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    getRowKey,
    getRowLink,
    items,
    onRowClick,
  }: {
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    getRowKey: (item: Record<string, unknown>) => string;
    getRowLink?: (item: Record<string, unknown>) => {
      href: string;
      label: string;
    };
    items: Array<Record<string, unknown>>;
    onRowClick?: (item: Record<string, unknown>) => void;
  }) => (
    <table>
      <tbody>
        {items.map((item) => {
          const rowLink = getRowLink?.(item);
          return (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key])}
                </td>
              ))}
              {rowLink && (
                <td>
                  <a aria-label={rowLink.label} href={rowLink.href}>
                    {rowLink.label}
                  </a>
                </td>
              )}
              {onRowClick && (
                <td>
                  <button type="button" onClick={() => onRowClick(item)}>
                    Open {String(item.topic ?? item.title)}
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  ),
}));

vi.mock('@ui/typography/heading', () => ({
  Heading: ({
    as: Component = 'h2',
    children,
    className,
  }: {
    as?: 'h1' | 'h2';
    children: ReactNode;
    className?: string;
  }) => <Component className={className}>{children}</Component>,
}));

vi.mock('@ui/typography/text', () => ({
  Text: ({
    as: Component = 'span',
    children,
  }: {
    as?: 'p' | 'span';
    children: ReactNode;
  }) => <Component>{children}</Component>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: mocks.push,
  }),
}));

function makeTrend(overrides: Record<string, unknown> = {}) {
  return {
    growthRate: 22,
    id: 'trend-1',
    mentions: 1200,
    platform: Platform.TIKTOK,
    topic: 'AI video',
    viralityScore: 82,
    ...overrides,
  };
}

function makeViralVideo(overrides: Record<string, unknown> = {}) {
  return {
    creatorHandle: 'creator',
    hashtags: ['AIAgents'],
    engagementRate: 8.5,
    id: 'viral-1',
    platform: Platform.TIKTOK,
    title: 'Launch hook',
    velocity: 40,
    videoUrl: 'https://example.test/video',
    viralScore: 91,
    views: 100_000,
    ...overrides,
  };
}

function configureSuccessfulService() {
  const healthyPlatforms = ['youtube', 'twitter', 'reddit', 'tiktok'];
  mocks.getCorpusFreshnessHealth.mockResolvedValue({
    generatedAt: '2026-08-31T08:05:00.000Z',
    providerFailures: [],
    refreshHealth: healthyPlatforms.map((platform) => ({
      platform,
      dataset: 'videos',
      scope: 'global',
      outcome: 'native_available',
      lastAttemptAt: '2026-08-31T08:00:00.000Z',
      lastSuccessfulRefreshAt: '2026-08-31T08:00:00.000Z',
    })),
    segments: healthyPlatforms.map((platform) => ({
      id: `${platform}:native-api`,
      latestSeenAt: new Date().toISOString(),
      platform,
      provider: 'native-api',
      status: 'healthy',
    })),
    status: 'healthy',
    summary: {
      activeTrends: 2,
      failingProviders: 0,
      freshSegments: healthyPlatforms.length,
      platforms: healthyPlatforms,
      referenceRecords: 4,
      staleSegments: 0,
      totalSegments: healthyPlatforms.length,
    },
  });
  mocks.getTrendsDiscovery.mockResolvedValue({
    trends: [
      makeTrend(),
      makeTrend({
        growthRate: -3,
        id: 'trend-2',
        platform: Platform.YOUTUBE,
        topic: 'Creator ops',
        viralityScore: 35,
      }),
    ],
  });
  mocks.getViralVideos.mockResolvedValue([
    makeViralVideo(),
    makeViralVideo({
      id: undefined,
      hashtags: ['other'],
      platform: Platform.YOUTUBE,
      title: 'External video',
      videoUrl: 'https://example.test/external-video',
    }),
  ]);
  mocks.getTrendingHashtags.mockResolvedValue([
    { hashtag: '#AIAgents', platform: Platform.TIKTOK },
  ]);
  mocks.getTrendingSounds.mockResolvedValue([
    { playUrl: 'https://example.test/sound', soundName: 'Launch audio' },
  ]);
}

describe('DiscoveryTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSuccessfulService();
    mocks.getTrendsService.mockResolvedValue({
      getCorpusFreshnessHealth: mocks.getCorpusFreshnessHealth,
      getTrendsDiscovery: mocks.getTrendsDiscovery,
      getTrendingHashtags: mocks.getTrendingHashtags,
      getTrendingSounds: mocks.getTrendingSounds,
      getViralVideos: mocks.getViralVideos,
    });
  });

  function renderDiscoveryTrends(isStrictMode: boolean = false) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const content = (
      <PageHelpProvider
        help={{ title: 'Trends', body: 'Browse saved trends.' }}
      >
        <DiscoveryTrends />
      </PageHelpProvider>
    );

    const rendered = render(
      <QueryClientProvider client={queryClient}>
        {isStrictMode ? <StrictMode>{content}</StrictMode> : content}
      </QueryClientProvider>,
    );
    return { ...rendered, queryClient };
  }

  it('loads trend surfaces and routes interactive trend content', async () => {
    renderDiscoveryTrends();

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Social Media Trends',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getAllByRole('button', { name: 'About this page' }),
    ).toHaveLength(1);
    expect(screen.getByTestId('socials-platform-filter')).toBeInTheDocument();
    expect(screen.getByTestId('container')).toBeInTheDocument();
    expect(await screen.findByText('AI video')).toBeInTheDocument();
    expect(screen.getByText('Creator ops')).toBeInTheDocument();
    expect(screen.getByText('#AIAgents')).toBeInTheDocument();
    expect(screen.getByText('Launch audio')).toBeInTheDocument();
    expect(screen.getByText(/Highest term volume:/)).toBeInTheDocument();
    expect(screen.getByText('Collection recorded')).toBeInTheDocument();
    expect(screen.getByText('youtube · available')).toBeInTheDocument();
    expect(screen.queryByText(/Native Api/)).not.toBeInTheDocument();

    // A real anchor, not a click handler: the router prefetches the trend
    // detail route before the click and cmd-click opens it in a new tab.
    expect(screen.getByRole('link', { name: 'Open AI video' })).toHaveAttribute(
      'href',
      '/org-1/brand-1/discovery/trends/detail/trend-1',
    );

    // Market viral videos, not the brand's own uploads.
    await waitFor(() => {
      expect(mocks.getViralVideos).toHaveBeenCalledWith({
        limit: 100,
        relevance: 'market',
        timeframe: Timeframe.H72,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => {
      expect(mocks.getViralVideos).toHaveBeenLastCalledWith({
        limit: 100,
        relevance: 'market',
        timeframe: Timeframe.D7,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    expect(screen.getByTestId('remix-modal')).toHaveTextContent('Launch hook');
    fireEvent.click(screen.getByRole('button', { name: 'Close Remix' }));
    expect(screen.queryByTestId('remix-modal')).toBeNull();

    expect(
      screen
        .getAllByRole('link', { name: 'Open source' })
        .some(
          (link) =>
            link.getAttribute('href') === 'https://example.test/external-video',
        ),
    ).toBe(true);
  });

  it('makes brand relevance explicit without changing the market default', async () => {
    renderDiscoveryTrends();
    await screen.findByText('AI video');
    expect(mocks.getTrendsDiscovery).toHaveBeenCalledWith({
      relevance: 'market',
      signal: expect.any(AbortSignal),
    });
    fireEvent.click(screen.getByRole('button', { name: 'For this brand' }));
    await waitFor(() =>
      expect(mocks.getViralVideos).toHaveBeenLastCalledWith({
        limit: 100,
        relevance: 'brand',
        timeframe: Timeframe.H72,
      }),
    );
    expect(mocks.getTrendsDiscovery).toHaveBeenLastCalledWith({
      relevance: 'brand',
      signal: expect.any(AbortSignal),
    });
  });

  it('filters the content gallery by the selected hashtag', async () => {
    renderDiscoveryTrends();
    await screen.findByText('#AIAgents');
    expect(await screen.findByText('External video')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '#AIAgents' }));
    expect(screen.getByText('Launch hook')).toBeInTheDocument();
    expect(screen.queryByText('External video')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear hashtag filter' }),
    );
    expect(screen.getByText('External video')).toBeInTheDocument();
  });

  it('keeps missing collection evidence separate from preview warnings', async () => {
    mocks.getCorpusFreshnessHealth.mockResolvedValue({
      generatedAt: '2026-08-31T08:05:00.000Z',
      providerFailures: [
        {
          affectedTrendCount: 1,
          latestObservedAt: '2026-08-31T08:00:00.000Z',
          message: 'Fallback data is currently unavailable.',
          platform: 'youtube',
          provider: 'apify',
          reason: 'fallback_source_preview',
          retryAction: 'Wait for scheduled ingestion.',
          severity: 'warning',
        },
      ],
      segments: [],
      status: 'degraded',
      summary: {
        activeTrends: 2,
        failingProviders: 1,
        freshSegments: 0,
        platforms: ['youtube'],
        referenceRecords: 4,
        staleSegments: 0,
        totalSegments: 0,
      },
    });

    renderDiscoveryTrends();

    expect(
      await screen.findByText('No collection recorded'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Source previews use fallback data/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Live sync')).not.toBeInTheDocument();
    expect(
      screen.getByText('No saved collection attempts for this scope.'),
    ).toBeInTheDocument();
  });

  it('shows corpus health as unavailable when its request fails', async () => {
    mocks.getCorpusFreshnessHealth.mockRejectedValue(
      new Error('corpus health failed'),
    );

    renderDiscoveryTrends();

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/Collection health could not be loaded/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Checking collection')).not.toBeInTheDocument();
  });

  it('retains scoped query data when a reload fails and reports the failure', async () => {
    const { queryClient } = renderDiscoveryTrends();
    await screen.findByText('#AIAgents');
    await screen.findByText('Launch audio');
    mocks.getTrendsDiscovery.mockRejectedValue(new Error('topics failed'));
    mocks.getTrendingHashtags.mockRejectedValue(new Error('hashtags failed'));
    mocks.getTrendingSounds.mockRejectedValue(new Error('sounds failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some trend data could not be loaded.',
    );
    expect(screen.getByText('#AIAgents')).toBeInTheDocument();
    expect(screen.getByText('Launch audio')).toBeInTheDocument();
    expect(
      queryClient.getQueryData(['discovery-hashtags', 'org-1', 'brand-1', '']),
    ).toEqual([{ hashtag: '#AIAgents', platform: Platform.TIKTOK }]);
  });

  it('renders an empty observed topic state without requiring connections', async () => {
    mocks.getTrendsDiscovery.mockResolvedValue({ trends: [] });
    renderDiscoveryTrends();
    expect(
      await screen.findByText('No trending topics available.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Connect your social accounts/),
    ).not.toBeInTheDocument();
  });

  it('aborts the corpus health request across a Strict Mode remount', async () => {
    mocks.getCorpusFreshnessHealth.mockReturnValue(
      new Promise(() => undefined),
    );

    const view = renderDiscoveryTrends(true);

    await waitFor(() => {
      expect(mocks.getCorpusFreshnessHealth).toHaveBeenCalled();
    });

    const corpusHealthCall = mocks.getCorpusFreshnessHealth.mock.calls.at(-1);
    const corpusHealthSignal = corpusHealthCall?.[0] as AbortSignal;
    view.unmount();
    expect(corpusHealthSignal.aborted).toBe(true);
  });
});
