import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { OutlierLibraryPostResponse } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listPosts: vi.fn(),
  openRemix: vi.fn().mockResolvedValue(undefined),
  params: {} as Record<string, string>,
  posts: [] as OutlierLibraryPostResponse[],
  setSearch: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return {
    useFormatter: () => ({
      dateTime: (value: Date) => value.toISOString().slice(0, 10),
    }),
    useTranslations: translateFromCatalog,
  };
});

vi.mock('@hooks/auth/use-authed-query/use-authed-query', () => ({
  useAuthedQuery: (options: {
    queryFn: (
      service: { listPosts: typeof mocks.listPosts },
      signal: AbortSignal,
    ) => Promise<unknown>;
  }) => {
    void options.queryFn(
      { listPosts: mocks.listPosts },
      new AbortController().signal,
    );
    return {
      data: {
        docs: mocks.posts,
        limit: 100,
        page: 1,
        total: mocks.posts.length,
      },
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/features/research/remix/DiscoveryRemixProvider', () => ({
  useOptionalDiscoveryRemix: () => ({ openRemix: mocks.openRemix }),
}));

vi.mock('@/features/research/work-surface/ResearchWorkSurfaceProvider', () => ({
  useResearchQueryState: () => ['', mocks.setSearch],
  useResearchSearchParamState: ({
    defaultValue,
    key,
  }: {
    defaultValue: string;
    key: string;
  }) => [mocks.params[key] ?? defaultValue, vi.fn()],
}));

vi.mock('@/components/analytics/trends/social-media-player', () => ({
  default: ({ sourceUrl }: { sourceUrl?: string | null }) => (
    <p>Player at {sourceUrl}</p>
  ),
}));

import TrendsOutliers from '@/features/trends/outliers/trends-outliers';

function post(
  id: string,
  overrides: Partial<OutlierLibraryPostResponse> = {},
): OutlierLibraryPostResponse {
  return {
    captionExcerpt: `Caption ${id}`,
    comments: null,
    countsReadAt: '2026-11-27T06:00:00.000Z',
    creator: {
      displayName: null,
      followersCount: null,
      handle: `creator-${id}`,
      id: `creator-${id}`,
    },
    externalId: id,
    format: null,
    hashtags: [],
    id,
    likes: null,
    medianViews: 1_000,
    outlierRatio: 12,
    outlierTier: 'breakout',
    platform: 'tiktok',
    publishedAt: '2026-11-20T09:00:00.000Z',
    sampleSize: 20,
    soundId: null,
    url: `https://www.tiktok.com/@creator-${id}/video/7300000000000000000`,
    views: 12_000,
    ...overrides,
  };
}

describe('TrendsOutliers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.params = {};
    mocks.posts = [
      post('a'),
      post('b', {
        outlierRatio: 4,
        outlierTier: 'outlier',
        platform: 'instagram',
        url: 'https://www.instagram.com/reel/Cabc123/',
      }),
    ];
    mocks.listPosts.mockResolvedValue(undefined);
  });

  it('lists each outlier with its multiple, typical post and sample size', () => {
    render(<TrendsOutliers onSourceChange={vi.fn()} />);

    const row = screen.getByRole('row', { name: /Caption a/ });
    expect(within(row).getByText('12x')).toBeInTheDocument();
    expect(within(row).getByText('12.0k')).toBeInTheDocument();
    expect(within(row).getByText('1.0k (20)')).toBeInTheDocument();
    expect(
      screen.getByText(/the median of their last 20 posts/),
    ).toBeInTheDocument();
  });

  it('opens a row in its platform player with the read date, and remixes it from the library post', () => {
    render(<TrendsOutliers onSourceChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('row', { name: /Caption a/ }));

    expect(
      screen.getByText(
        'Player at https://www.tiktok.com/@creator-a/video/7300000000000000000',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Numbers read on 2026-11-27/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      'https://www.tiktok.com/@creator-a/video/7300000000000000000',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remix for my brand' }));
    expect(mocks.openRemix).toHaveBeenCalledWith({
      kind: 'outlier_post',
      outlierPostId: 'a',
    });
  });

  it('asks the server for one platform only when exactly one is chosen', () => {
    mocks.params = { platform: 'instagram', tier: 'outlier,breakout' };
    render(<TrendsOutliers onSourceChange={vi.fn()} />);

    expect(mocks.listPosts).toHaveBeenCalledWith(
      { limit: 100, page: 1, platform: 'instagram' },
      expect.any(AbortSignal),
    );
  });

  it('leaves YouTube posts out until its policy step is done', () => {
    mocks.posts = [post('a'), post('yt', { platform: 'youtube' })];
    render(<TrendsOutliers onSourceChange={vi.fn()} />);

    expect(screen.queryByText('Caption yt')).not.toBeInTheDocument();
    expect(screen.getByText('Caption a')).toBeInTheDocument();
  });
});
