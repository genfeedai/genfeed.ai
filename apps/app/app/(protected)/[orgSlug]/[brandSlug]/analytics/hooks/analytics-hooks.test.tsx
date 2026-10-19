import '@testing-library/jest-dom/vitest';
import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import type { IViralHooksResult } from '@genfeedai/contracts/interfaces';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsHooks from './analytics-hooks';

class MockIntersectionObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

/** Stands in for the analytics layout, which owns the subbar. */
function SubbarHost() {
  const { toolbarNode, triggerRefresh } = useAnalyticsContext();
  return (
    <div>
      <button type="button" onClick={triggerRefresh}>
        Refresh
      </button>
      {toolbarNode}
    </div>
  );
}

function analyticsHooksTree(brandId?: string) {
  return (
    <AnalyticsProvider>
      <SubbarHost />
      <AnalyticsHooks brandId={brandId} />
    </AnalyticsProvider>
  );
}

const mocks = vi.hoisted(() => ({
  getAnalyticsService: vi.fn(),
  getViralHooks: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  organizationId: 'org-1' as string | null,
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: mocks.organizationId,
  }),
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatCompactNumber: (value: number) => `${value}`,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getAnalyticsService,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

// A stable translator, as next-intl returns, so the toolbar memo holds.
vi.mock('next-intl', () => {
  const translate = (key: string) => key;
  return { useTranslations: () => translate };
});

vi.mock('@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu', () => ({
  default: ({
    facets,
  }: {
    facets: Array<{
      key: string;
      options: Array<{ label: string; value: string }>;
      onChange: (value: string) => void;
    }>;
  }) => (
    <div>
      {facets.flatMap((facet) =>
        facet.options.map((option) => (
          <button
            key={`${facet.key}:${option.value}`}
            type="button"
            onClick={() => facet.onChange(option.value)}
          >
            {option.label}
          </button>
        )),
      )}
    </div>
  ),
}));

vi.mock('@services/analytics/analytics.service', () => ({
  AnalyticsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock('@ui/display/platform-badge/PlatformBadge', () => {
  const labels: Record<string, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
  };
  return {
    default: ({
      platform,
      showLabel = true,
    }: {
      platform: string;
      showLabel?: boolean;
    }) => (
      <span role="img" aria-label={labels[platform]}>
        {showLabel ? labels[platform] : null}
      </span>
    ),
  };
});

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
}));

vi.mock('@ui/display/badge/Badge', () => ({
  default: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('@ui/display/metric-item/MetricItem', () => ({
  default: ({ label, value }: { label: string; value: ReactNode }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: <T,>({
    columns,
    getRowKey,
    isLoading,
    items,
  }: {
    label?: string;
    columns: Array<{
      header: string;
      render?: (item: T) => ReactNode;
    }>;
    getRowKey: (item: T) => string;
    isLoading?: boolean;
    items: T[];
  }) => {
    if (isLoading) {
      return <div data-testid="hooks-table-skeleton" />;
    }

    return (
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.header}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getRowKey(item)}>
              {columns.map((column) => (
                <td key={column.header}>
                  {column.render ? column.render(item) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

/**
 * The exact `GET /analytics/hooks` shape `AnalyticsResponseProjection
 * .buildViralHooks` produces: a text hook per post, string platform ids, and
 * engagement/view aggregates (genfeedai/genfeed.ai#5415). Both rankings are
 * derived from `videos` (grouped by lowercased hook, posts ordered by
 * engagement): the pattern-interrupt post wins on engagement, the two
 * "three mistakes" posts (avg 90 engagement, avg 4200 views) win on reach.
 */
function hookResponse(): IViralHooksResult {
  return {
    analysis: {
      hookEffectiveness: [
        {
          avgEngagement: 320,
          avgViews: 1600,
          hook: 'open with a pattern interrupt',
          postCount: 1,
        },
        {
          avgEngagement: 90,
          avgViews: 4200,
          hook: 'three mistakes i made',
          postCount: 2,
        },
      ],
      topHooks: [
        {
          avgEngagement: 320,
          hook: 'open with a pattern interrupt',
          postCount: 1,
        },
        { avgEngagement: 90, hook: 'three mistakes i made', postCount: 2 },
      ],
      // Per-platform sums of the posts below: video-1 splits 1200 views /
      // 250 engagement on TikTok and 400 / 70 on Instagram; video-3 and
      // video-4 are TikTok-only, video-2 Instagram-only.
      topPlatforms: [
        {
          platform: 'tiktok',
          postCount: 3,
          totalEngagement: 430,
          totalViews: 9600,
        },
        {
          platform: 'instagram',
          postCount: 2,
          totalEngagement: 82,
          totalViews: 480,
        },
      ],
      totalVideos: 4,
    },
    videos: [
      {
        description: 'Open with a pattern interrupt\nThen explain the offer.',
        hook: 'Open with a pattern interrupt',
        id: 'video-1',
        platforms: ['tiktok', 'instagram'],
        title: 'Winning hook video',
        totalEngagement: 320,
        totalViews: 1600,
      },
      {
        description: 'Three mistakes I made\nNumber two cost me a launch.',
        hook: 'Three mistakes I made',
        id: 'video-3',
        platforms: ['tiktok'],
        title: 'Launch lessons',
        totalEngagement: 100,
        totalViews: 5000,
      },
      {
        description: 'Three mistakes I made\nWhat I would do differently.',
        hook: 'Three mistakes I made',
        id: 'video-4',
        platforms: ['tiktok'],
        title: 'Hiring lessons',
        totalEngagement: 80,
        totalViews: 3400,
      },
      {
        description: '',
        hook: '',
        id: 'video-2',
        platforms: ['instagram'],
        title: 'Untitled',
        totalEngagement: 12,
        totalViews: 80,
      },
    ],
  };
}

describe('AnalyticsHooks', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    vi.clearAllMocks();
    mocks.organizationId = 'org-1';
    mocks.getViralHooks.mockResolvedValue(hookResponse());
    mocks.getAnalyticsService.mockResolvedValue({
      getViralHooks: mocks.getViralHooks,
    });
  });

  it('renders hook analytics and refreshes with brand query params', async () => {
    render(analyticsHooksTree());

    expect(await screen.findByText('Winning hook video')).toBeVisible();
    // The breadcrumb is the only title: no heading or description in content.
    expect(screen.queryByText('Viral Hooks')).toBeNull();
    expect(
      screen.queryByText('Analyze hooks and engagement patterns.'),
    ).toBeNull();

    // Stat cards
    expect(screen.getByText('Posts Analyzed')).toBeVisible();
    expect(screen.getByText('Hook Patterns')).toBeVisible();
    expect(screen.getByText('TIKTOK')).toBeVisible();

    // Platform overview comes from `analysis.topPlatforms`
    expect(screen.getByText('Total Views: 9600')).toBeVisible();
    expect(screen.getByText('Total Engagement: 430')).toBeVisible();
    expect(screen.getByText('Total Views: 480')).toBeVisible();
    expect(screen.getByText('Total Engagement: 82')).toBeVisible();
    expect(screen.queryByText('No data available')).toBeNull();

    // Post table renders each post's text hook, platform ids and aggregates
    const [, winningRow, launchRow, hiringRow, untitledRow] = within(
      screen.getByRole('table'),
    ).getAllByRole('row');
    expect(
      within(winningRow).getByText('Open with a pattern interrupt'),
    ).toBeVisible();
    expect(within(winningRow).getByLabelText('TikTok')).toBeVisible();
    expect(within(winningRow).getByLabelText('Instagram')).toBeVisible();
    expect(within(winningRow).getByText('1600')).toBeVisible();
    expect(within(winningRow).getByText('320')).toBeVisible();
    expect(within(launchRow).getByText('Launch lessons')).toBeVisible();
    expect(within(launchRow).getByText('Three mistakes I made')).toBeVisible();
    expect(within(launchRow).getByText('5000')).toBeVisible();
    expect(within(hiringRow).getByText('Hiring lessons')).toBeVisible();
    expect(within(hiringRow).getByText('3400')).toBeVisible();
    expect(within(untitledRow).getByText('Untitled')).toBeVisible();
    expect(within(untitledRow).getByText('No hook detected')).toBeVisible();
    expect(within(untitledRow).getByLabelText('Instagram')).toBeVisible();

    // Hook pattern rankings: by engagement, then by reach (avg views)
    const rankedHooks = (heading: string) =>
      within(screen.getByText(heading).closest('section') as HTMLElement)
        .getAllByText(/^(open with a pattern interrupt|three mistakes i made)$/)
        .map((node) => node.textContent);
    expect(rankedHooks('Top Performing Hook Patterns')).toEqual([
      'open with a pattern interrupt',
      'three mistakes i made',
    ]);
    expect(rankedHooks('Hooks by Reach')).toEqual([
      'three mistakes i made',
      'open with a pattern interrupt',
    ]);
    expect(screen.getByText('320 avg engagement • 1 posts')).toBeVisible();
    expect(screen.getByText('90 avg engagement • 2 posts')).toBeVisible();
    expect(screen.getByText('4200')).toBeVisible();

    expect(mocks.getViralHooks).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'brand-1' }),
    );
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      'GET /analytics/hooks success',
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.getViralHooks).toHaveBeenCalledTimes(2));
  });

  it('filters by outlier tier from the subbar filter menu', async () => {
    render(analyticsHooksTree());
    await screen.findByText('Winning hook video');

    fireEvent.click(screen.getByRole('button', { name: 'breakoutsOnly' }));

    await waitFor(() =>
      expect(mocks.getViralHooks).toHaveBeenLastCalledWith(
        expect.objectContaining({ minOutlierTier: 'breakout' }),
      ),
    );
  });

  it('renders the page shell while hook data is loading', () => {
    mocks.getViralHooks.mockReturnValue(new Promise(() => {}));

    render(analyticsHooksTree());

    expect(screen.getByText('Posts Analyzed')).toBeVisible();
    expect(screen.getByText('Hook Patterns')).toBeVisible();
    expect(screen.getByText('Best Hook Avg Engagement')).toBeVisible();
    expect(screen.getByText('Top Platform')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(screen.getByTestId('hooks-table-skeleton')).toBeVisible();
  });

  it('uses an explicit brand id and renders default empty data', async () => {
    mocks.getViralHooks.mockResolvedValueOnce({});

    render(analyticsHooksTree('brand-prop'));

    expect(await screen.findAllByText('-')).toHaveLength(2);
    // Platforms without data are hidden, not rendered as empty cards.
    expect(screen.queryByTestId('hook-platform-tiktok')).toBeNull();
    expect(screen.queryByText('No data available')).toBeNull();
    expect(
      screen.getByText('No top hook patterns detected yet.'),
    ).toBeVisible();
    expect(screen.getByText('No hook reach data yet.')).toBeVisible();
    expect(mocks.getViralHooks).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'brand-prop' }),
    );
  });

  it('does not fetch without organization context and resets on failures', async () => {
    mocks.organizationId = null;
    const { rerender } = render(analyticsHooksTree());

    expect(screen.getByText('Posts Analyzed')).toBeVisible();
    expect(mocks.getAnalyticsService).not.toHaveBeenCalled();

    mocks.organizationId = 'org-1';
    mocks.getViralHooks.mockRejectedValueOnce(new Error('hooks failed'));
    rerender(analyticsHooksTree());

    await waitFor(() =>
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'GET /analytics/hooks failed',
        expect.any(Error),
      ),
    );
    expect(screen.getAllByText('-')).toHaveLength(2);
  });
});
