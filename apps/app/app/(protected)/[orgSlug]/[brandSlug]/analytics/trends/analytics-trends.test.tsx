import '@testing-library/jest-dom';
import { Platform, Timeframe } from '@genfeedai/enums';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsTrends from './analytics-trends';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
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
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
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
    onHashtagClick,
    onPlatformChange,
    selectedPlatform,
  }: {
    hashtags: Array<{ hashtag: string }>;
    onHashtagClick: (hashtag: { hashtag: string }) => void;
    onPlatformChange: (platform: string) => void;
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
  ViralVideoLeaderboard: ({
    onTimeframeChange,
    onVideoClick,
    timeframe,
    videos,
  }: {
    onTimeframeChange: (timeframe: Timeframe.D7) => void;
    onVideoClick: (video: Record<string, unknown>) => void;
    timeframe: string;
    videos: Array<{ title: string }>;
  }) => (
    <section>
      <div>Video timeframe: {timeframe}</div>
      <button type="button" onClick={() => onTimeframeChange(Timeframe.D7)}>
        Last 7 Days
      </button>
      {videos.map((video) => (
        <button
          key={video.title}
          type="button"
          onClick={() => onVideoClick(video)}
        >
          Open {video.title}
        </button>
      ))}
    </section>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children: ReactNode; label?: string }) => (
    <section>
      {label && <h2>{label}</h2>}
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
    items,
    onRowClick,
  }: {
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    getRowKey: (item: Record<string, unknown>) => string;
    items: Array<Record<string, unknown>>;
    onRowClick?: (item: Record<string, unknown>) => void;
  }) => (
    <table>
      <tbody>
        {items.map((item) => (
          <tr key={getRowKey(item)}>
            {columns.map((column) => (
              <td key={column.key}>
                {column.render ? column.render(item) : String(item[column.key])}
              </td>
            ))}
            {onRowClick && (
              <td>
                <button type="button" onClick={() => onRowClick(item)}>
                  Open {String(item.topic ?? item.title)}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

vi.mock('@ui/layout/stack', () => ({
  VStack: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/typography/heading', () => ({
  Heading: ({
    as: Component = 'h2',
    children,
  }: {
    as?: 'h1' | 'h2';
    children: ReactNode;
  }) => <Component>{children}</Component>,
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

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    creatorHandle: 'creator',
    engagementRate: 8.5,
    id: 'video-1',
    platform: Platform.TIKTOK,
    publishedAt: '2026-05-19T08:00:00.000Z',
    title: 'Launch hook',
    velocity: 42,
    videoUrl: 'https://example.test/video',
    viralScore: 91,
    views: 100_000,
    ...overrides,
  };
}

function configureSuccessfulService() {
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
    makeVideo(),
    makeVideo({
      id: undefined,
      platform: Platform.YOUTUBE,
      title: 'External video',
      videoUrl: 'https://example.test/external-video',
      viralScore: 44,
    }),
  ]);
  mocks.getTrendingHashtags.mockResolvedValue([
    { hashtag: '#AIAgents', platform: Platform.TIKTOK },
  ]);
  mocks.getTrendingSounds.mockResolvedValue([
    { playUrl: 'https://example.test/sound', title: 'Launch audio' },
  ]);
}

describe('AnalyticsTrends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', mocks.open);
    configureSuccessfulService();
    mocks.cacheGet.mockReturnValue(null);
    mocks.getTrendsService.mockResolvedValue({
      getTrendsDiscovery: mocks.getTrendsDiscovery,
      getTrendingHashtags: mocks.getTrendingHashtags,
      getTrendingSounds: mocks.getTrendingSounds,
      getTrendingTopics: mocks.getTrendingTopics,
      getViralVideos: mocks.getViralVideos,
    });
  });

  it('loads trend surfaces and routes interactive trend content', async () => {
    render(<AnalyticsTrends />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Social Media Trends',
    );
    expect(await screen.findByText('AI video')).toBeInTheDocument();
    expect(screen.getByText('Creator ops')).toBeInTheDocument();
    expect(screen.getByText('#AIAgents')).toBeInTheDocument();
    expect(screen.getByText('Launch audio')).toBeInTheDocument();
    expect(screen.getByText(/Highest term volume:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open AI video' }));
    expect(mocks.push).toHaveBeenCalledWith('/analytics/trends/detail/trend-1');

    fireEvent.click(screen.getByRole('button', { name: 'Last 7 Days' }));
    await waitFor(() => {
      expect(mocks.getViralVideos).toHaveBeenCalledWith({
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

    fireEvent.click(screen.getByRole('button', { name: '#AIAgents' }));
    expect(mocks.loggerInfo).toHaveBeenCalledWith('Hashtag clicked', {
      hashtag: '#AIAgents',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Launch audio' }));
    expect(mocks.open).toHaveBeenCalledWith(
      'https://example.test/sound',
      '_blank',
    );
  });

  it('renders empty topic copy and falls back to cached videos, hashtags, and sounds', async () => {
    mocks.getTrendsDiscovery.mockResolvedValue({ trends: [] });
    mocks.getTrendingTopics.mockRejectedValue(new Error('topics failed'));
    mocks.getViralVideos.mockRejectedValue(new Error('videos failed'));
    mocks.getTrendingHashtags.mockRejectedValue(new Error('hashtags failed'));
    mocks.getTrendingSounds.mockRejectedValue(new Error('sounds failed'));
    mocks.cacheGet.mockImplementation((key: string) => {
      if (key.startsWith('viral:')) {
        return [makeVideo({ id: 'cached-video', title: 'Cached video' })];
      }
      if (key.startsWith('hashtags:')) {
        return [{ hashtag: '#CachedTag' }];
      }
      if (key.startsWith('sounds:')) {
        return [{ title: 'Cached sound' }];
      }
      return null;
    });

    render(<AnalyticsTrends />);

    expect(
      await screen.findByText('No trending topics available.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cached video')).toBeInTheDocument();
    expect(screen.getByText('#CachedTag')).toBeInTheDocument();
    expect(screen.getByText('Cached sound')).toBeInTheDocument();
    expect(mocks.loggerError).toHaveBeenCalledWith('GET /trends failed', {
      error: expect.any(Error),
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch viral videos',
      { error: expect.any(Error) },
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch trending hashtags',
      { error: expect.any(Error) },
    );
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch trending sounds',
      { error: expect.any(Error) },
    );
  });
});
