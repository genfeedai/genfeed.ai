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
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  getCorpusFreshnessHealth: vi.fn(),
  getTrendsDiscovery: vi.fn(),
  getTrendingHashtags: vi.fn(),
  getTrendingSounds: vi.fn(),
  getTrendingTopics: vi.fn(),
  getTrendsService: vi.fn(),
  getViralVideos: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  open: vi.fn(),
  push: vi.fn(),
  viralVideoProps: vi.fn(),
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

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createLocalStorageCache: () => ({
    get: mocks.cacheGet,
    set: mocks.cacheSet,
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

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
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
    selectedPlatform,
  }: {
    hashtags: Array<{ hashtag: string }>;
    onPlatformChange: (platform: string) => void;
    selectedPlatform: string;
  }) => (
    <section>
      <div>Selected hashtag platform: {selectedPlatform || 'all'}</div>
      <button type="button" onClick={() => onPlatformChange('youtube')}>
        Filter YouTube Hashtags
      </button>
      {hashtags.map((hashtag) => (
        <span key={hashtag.hashtag}>{hashtag.hashtag}</span>
      ))}
    </section>
  ),
  TrendingSounds: ({
    onSoundClick,
    sounds,
  }: {
    onSoundClick: (sound: { title: string }) => void;
    sounds: Array<{ title: string }>;
  }) => (
    <section>
      {sounds.map((sound) => (
        <button
          key={sound.title}
          type="button"
          onClick={() => onSoundClick(sound)}
        >
          {sound.title}
        </button>
      ))}
    </section>
  ),
  ViralVideoLeaderboard: (props: {
    onTimeframeChange: (timeframe: Timeframe.D7) => void;
    onVideoClick: (video: Record<string, unknown>) => void;
    timeframe: string;
    videos: Array<{ creatorHandle: string; title: string }>;
  }) => {
    mocks.viralVideoProps(props);

    return (
      <section>
        <div>Video timeframe: {props.timeframe}</div>
        <button
          type="button"
          onClick={() => props.onTimeframeChange(Timeframe.D7)}
        >
          Last 7 Days
        </button>
        {props.videos.map((video) => (
          <button
            key={video.title}
            type="button"
            onClick={() => props.onVideoClick(video)}
          >
            Open {video.title}
          </button>
        ))}
      </section>
    );
  },
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
  mocks.getTrendingTopics.mockResolvedValue([
    makeTrend(),
    makeTrend({
      id: 'topic-youtube',
      mentions: 600,
      platform: Platform.YOUTUBE,
      topic: 'YouTube series',
    }),
    makeTrend({
      id: 'topic-twitter',
      mentions: 300,
      platform: Platform.TWITTER,
      topic: 'Launch thread',
    }),
    makeTrend({
      id: 'topic-instagram',
      mentions: 100,
      platform: Platform.INSTAGRAM,
      topic: 'Carousel hooks',
    }),
  ]);
  mocks.getViralVideos.mockResolvedValue([
    makeViralVideo(),
    makeViralVideo({
      id: undefined,
      platform: Platform.YOUTUBE,
      title: 'External video',
      videoUrl: 'https://example.test/external-video',
    }),
  ]);
  mocks.getTrendingHashtags.mockResolvedValue([
    { hashtag: '#AIAgents', platform: Platform.TIKTOK },
  ]);
  mocks.getTrendingSounds.mockResolvedValue([
    { playUrl: 'https://example.test/sound', title: 'Launch audio' },
  ]);
}

describe('DiscoveryTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mocks.open);
    configureSuccessfulService();
    mocks.cacheGet.mockReturnValue(null);
    mocks.getTrendsService.mockResolvedValue({
      getCorpusFreshnessHealth: mocks.getCorpusFreshnessHealth,
      getTrendsDiscovery: mocks.getTrendsDiscovery,
      getTrendingHashtags: mocks.getTrendingHashtags,
      getTrendingSounds: mocks.getTrendingSounds,
      getTrendingTopics: mocks.getTrendingTopics,
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
    expect(screen.getByText('Trend corpus healthy')).toBeInTheDocument();
    expect(screen.getByText('Youtube · healthy')).toBeInTheDocument();
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
        limit: 12,
        timeframe: Timeframe.H72,
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Last 7 Days' }));
    await waitFor(() => {
      expect(mocks.getViralVideos).toHaveBeenLastCalledWith({
        limit: 12,
        timeframe: Timeframe.D7,
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Launch hook' }));
    expect(screen.getByTestId('remix-modal')).toHaveTextContent('Launch hook');
    fireEvent.click(screen.getByRole('button', { name: 'Close Remix' }));
    expect(screen.queryByTestId('remix-modal')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open External video' }),
    );
    expect(mocks.open).toHaveBeenCalledWith(
      'https://example.test/external-video',
      '_blank',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Launch audio' }));
    expect(mocks.open).toHaveBeenCalledWith(
      'https://example.test/sound',
      '_blank',
    );
  });

  it('shows a degraded corpus instead of claiming the sync is live', async () => {
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
      await screen.findByText('Trend corpus degraded'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apify: Saved fallback previews are being used/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Live sync')).not.toBeInTheDocument();
    expect(screen.getAllByText('Last refresh').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Last attempt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it('shows corpus health as unavailable when its request fails', async () => {
    mocks.getCorpusFreshnessHealth.mockRejectedValue(
      new Error('corpus health failed'),
    );

    renderDiscoveryTrends();

    expect(
      await screen.findByText('Trend corpus unavailable'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Source health could not be loaded/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Checking trend corpus')).not.toBeInTheDocument();
  });

  it('renders empty topic copy and falls back to cached hashtags and sounds', async () => {
    mocks.getTrendsDiscovery.mockResolvedValue({ trends: [] });
    mocks.getTrendingTopics.mockRejectedValue(new Error('topics failed'));
    mocks.getTrendingHashtags.mockRejectedValue(new Error('hashtags failed'));
    mocks.getTrendingSounds.mockRejectedValue(new Error('sounds failed'));
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key.startsWith('hashtags:')) {
        return [{ hashtag: '#CachedTag' }];
      }
      if (key.startsWith('sounds:')) {
        return [{ title: 'Cached sound' }];
      }
      return null;
    });

    renderDiscoveryTrends();

    expect(
      await screen.findByText('No trending topics available.'),
    ).toBeInTheDocument();
    expect(screen.getByText('#CachedTag')).toBeInTheDocument();
    expect(screen.getByText('Cached sound')).toBeInTheDocument();
    expect(mocks.loggerError).toHaveBeenCalledWith('GET /trends failed', {
      error: expect.any(Error),
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch trending hashtags',
      { error: expect.any(Error) },
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch trending sounds',
      { error: expect.any(Error) },
    );
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
