import '@testing-library/jest-dom/vitest';
import { Platform } from '@genfeedai/contracts';
import {
  evaluationVideoCache,
  evaluationVideosQueryKey,
  invalidateEvaluationVideoRead,
} from '@hooks/ui/evaluation/use-evaluation/evaluation-read-cache';
import BrandTopVideosSection from '@pages/analytics/outliers/brand-top-videos-section';
import { normalizeBrandVideo } from '@pages/analytics/outliers/use-brand-top-videos';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const mocks = vi.hoisted(() => ({
  scopeKey: 'scoped-video-read',
  videoCache: new Map<string, unknown>(),
  findAllVideos: vi.fn(),
  getOutlierService: vi.fn(),
  getVideosService: vi.fn(),
  listOutlierPosts: vi.fn(),
  loggerError: vi.fn(),
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

vi.mock('@genfeedai/contexts/analytics/analytics-context', () => ({
  useOptionalAnalyticsContext: () => null,
}));

vi.mock(
  '@hooks/ui/evaluation/use-evaluation/evaluation-read-cache',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@hooks/ui/evaluation/use-evaluation/evaluation-read-cache')
    >()),
    useEvaluationReadScopeKey: () => mocks.scopeKey,
  }),
);

vi.mock('@helpers/data/cache/cache.helper', () => ({
  createLocalStorageCache: () => ({
    get: (key: string) => mocks.videoCache.get(key) ?? null,
    set: (key: string, value: unknown) => mocks.videoCache.set(key, value),
    remove: (key: string) => mocks.videoCache.delete(key),
  }),
}));

vi.mock('@helpers/formatting/date/date.helper', () => ({
  formatDate: (value: string | Date) => `formatted:${String(value)}`,
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatCompactNumber: (value: number) => `${value}n`,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) =>
    factory('mock-token') === 'videos-service'
      ? mocks.getVideosService
      : mocks.getOutlierService,
}));

vi.mock('@services/ingredients/videos.service', () => ({
  VideosService: { getInstance: vi.fn(() => 'videos-service') },
}));

vi.mock('@services/analytics/outlier-baselines.service', () => ({
  OutlierBaselinesService: { getInstance: vi.fn(() => 'outliers-service') },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError, info: vi.fn() },
}));

vi.mock('@pages/trends/list/components/HookRemixModal', () => ({
  default: ({
    isOpen,
    video,
  }: {
    isOpen: boolean;
    video?: { title?: string } | null;
  }) =>
    isOpen ? (
      <section data-testid="remix-modal">Remix {video?.title}</section>
    ) : null,
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    emptyLabel,
    getRowKey,
    items,
    onRowClick,
  }: {
    columns: Array<{
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    emptyLabel?: string;
    getRowKey: (item: Record<string, unknown>) => string;
    items: Array<Record<string, unknown>>;
    onRowClick?: (item: Record<string, unknown>) => void;
  }) =>
    items.length === 0 ? (
      <p>{emptyLabel}</p>
    ) : (
      <ul>
        {items.map((item) => (
          <li key={getRowKey(item)}>
            {columns.map((column) => (
              <div key={column.key}>
                {column.render ? column.render(item) : String(item[column.key])}
              </div>
            ))}
            {onRowClick && (
              <button type="button" onClick={() => onRowClick(item)}>
                Select {String(item.title)}
              </button>
            )}
          </li>
        ))}
      </ul>
    ),
}));

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    brand: { label: 'Creator' },
    createdAt: new Date().toISOString(),
    evaluation: {
      data: {
        actualPerformance: { engagementRate: 8.5, views: 100_000 },
        externalContent: { platform: Platform.TIKTOK },
        scores: { engagement: { viralityPotential: 91 } },
      },
    },
    id: 'video-1',
    ingredientUrl: 'https://example.test/video',
    metadataLabel: 'Launch hook',
    publishedAt: new Date().toISOString(),
    thumbnailUrl: 'https://example.test/thumbnail',
    ...overrides,
  };
}

describe('BrandTopVideosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.videoCache.clear();
    mocks.findAllVideos.mockResolvedValue([makeVideo()]);
    mocks.listOutlierPosts.mockResolvedValue({ docs: [], total: 0 });
    mocks.getVideosService.mockResolvedValue({
      findAll: mocks.findAllVideos,
    });
    mocks.getOutlierService.mockResolvedValue({
      listPosts: mocks.listOutlierPosts,
    });
  });

  function renderSection(isStrictMode = false) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const content = <BrandTopVideosSection />;
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        {isStrictMode ? <StrictMode>{content}</StrictMode> : content}
      </QueryClientProvider>,
    );
    return { ...rendered, queryClient };
  }

  it("reads the brand's own recent videos and opens remix on a row", async () => {
    renderSection();

    expect(await screen.findByText('Launch hook')).toBeInTheDocument();
    expect(mocks.findAllVideos).toHaveBeenCalledWith(
      {
        brand: 'brand-1',
        lightweight: true,
        limit: 12,
        sort: 'createdAt: -1',
      },
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select Launch hook' }));
    expect(screen.getByTestId('remix-modal')).toHaveTextContent('Launch hook');
  });

  it('normalizes videos with missing analytics data into a safe empty-metric row', () => {
    expect(
      normalizeBrandVideo(
        makeVideo({
          brand: undefined,
          evaluation: undefined,
          id: 'video-without-analytics',
          metadataLabel: undefined,
          provider: undefined,
          publishedAt: undefined,
        }) as never,
      ),
    ).toMatchObject({
      creatorHandle: 'Your brand',
      engagementRate: 0,
      platform: 'genfeed',
      title: 'video-wi',
      viralScore: 0,
      views: 0,
    });
  });

  it('shows an empty state when no videos exist', async () => {
    mocks.findAllVideos.mockResolvedValue([]);

    renderSection();

    expect(
      await screen.findByText('No published videos in this timeframe yet.'),
    ).toBeInTheDocument();
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('aborts the active request across a Strict Mode remount', async () => {
    mocks.findAllVideos.mockReturnValue(new Promise(() => undefined));

    const view = renderSection(true);

    await waitFor(() => {
      expect(mocks.findAllVideos).toHaveBeenCalledTimes(1);
    });
    const requestSignal = mocks.findAllVideos.mock.calls[0]?.[1] as AbortSignal;
    view.unmount();
    expect(requestSignal.aborted).toBe(true);
  });

  it('shows saved observations in an accessible expansion and honest score-only/absent states', async () => {
    const persuasion = {
      demandFit: 20,
      hookStrength: 90,
      openLoopIntegrity: 60,
      ctaNaturalness: 40,
      overall: 999,
    };
    const observation = 'Saved content-specific mechanism. '.repeat(20).trim();
    const evaluated = (id: string, data: object) =>
      makeVideo({ id, evaluation: { id: `eval-${id}`, data } });
    mocks.findAllVideos.mockResolvedValue([
      evaluated('written', {
        status: 'completed',
        overallScore: 72,
        scores: { persuasion },
        analysis: { strengths: ['', observation] },
      }),
      evaluated('scores', {
        status: 'completed',
        overallScore: 72,
        scores: { persuasion },
      }),
      evaluated('failed', { status: 'failed', scores: { persuasion } }),
    ]);

    renderSection();

    fireEvent.click(
      await screen.findByRole('button', { name: "Evaluator's observation" }),
    );
    expect(screen.getByText(observation)).toBeInTheDocument();
    expect(
      screen.getByText(
        'Layer scores are available; no written explanation was saved.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No persuasion analysis')).toBeInTheDocument();
  });

  it('refetches the warm mounted query after persisted evaluation changes in the same SPA', async () => {
    const { queryClient } = renderSection();
    await screen.findByText('Launch hook');
    expect(mocks.findAllVideos).toHaveBeenCalledTimes(1);
    mocks.findAllVideos.mockResolvedValue([
      makeVideo({ metadataLabel: 'Committed revision' }),
    ]);

    await invalidateEvaluationVideoRead(queryClient, mocks.scopeKey);

    expect(await screen.findByText('Committed revision')).toBeInTheDocument();
    expect(mocks.findAllVideos).toHaveBeenCalledTimes(2);
    expect(
      queryClient.getQueryState(evaluationVideosQueryKey(mocks.scopeKey))
        ?.isInvalidated,
    ).toBe(false);
  });

  it('refetches on reopening with a warm query instead of hiding external completion for 30 minutes', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const renderInSession = () =>
      render(
        <QueryClientProvider client={client}>
          <BrandTopVideosSection />
        </QueryClientProvider>,
      );
    const first = renderInSession();
    await screen.findByText('Launch hook');
    first.unmount();
    mocks.findAllVideos.mockResolvedValue([
      makeVideo({ metadataLabel: 'Background completion' }),
    ]);

    renderInSession();

    expect(
      await screen.findByText('Background completion'),
    ).toBeInTheDocument();
    expect(mocks.findAllVideos).toHaveBeenCalledTimes(2);
  });

  it('warns on same-scope fallback and retries into a fresh successful read', async () => {
    evaluationVideoCache.set(mocks.scopeKey, [
      {
        id: 'cached',
        title: 'Cached snapshot',
        platform: Platform.TIKTOK,
        publishedAt: new Date().toISOString(),
        views: 100,
        viralScore: 10,
      } as never,
    ]);
    mocks.findAllVideos.mockRejectedValue(new Error('offline'));

    renderSection();

    expect(
      await screen.findByText(
        'Showing cached data; evaluation may be out of date.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Cached snapshot')).toBeInTheDocument();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to fetch brand top videos',
      { error: expect.any(Error) },
    );

    mocks.findAllVideos.mockResolvedValue([
      makeVideo({ metadataLabel: 'Fresh retry' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Fresh retry')).toBeInTheDocument();
    expect(
      screen.queryByText('Showing cached data; evaluation may be out of date.'),
    ).not.toBeInTheDocument();
  });
});
