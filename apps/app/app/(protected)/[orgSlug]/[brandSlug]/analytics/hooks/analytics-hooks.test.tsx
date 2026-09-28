import '@testing-library/jest-dom/vitest';
import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
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

function analyticsHooksTree(brandId?: string) {
  return (
    <AnalyticsProvider>
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@ui/primitives/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
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

vi.mock('@ui-constants/platform.constant', () => ({
  PLATFORM_CONFIGS_ARRAY: [
    {
      color: '#111111',
      icon: ({ className }: { className?: string }) => (
        <span className={className}>TT</span>
      ),
      id: 'tiktok',
      label: 'TikTok',
    },
    {
      color: '#222222',
      icon: ({ className }: { className?: string }) => (
        <span className={className}>IG</span>
      ),
      id: 'instagram',
      label: 'Instagram',
    },
  ],
}));

vi.mock('@ui/buttons/refresh/button-refresh/ButtonRefresh', () => ({
  default: ({
    isRefreshing,
    onClick,
  }: {
    isRefreshing?: boolean;
    onClick: () => void;
  }) => (
    <button disabled={isRefreshing} type="button" onClick={onClick}>
      Refresh
    </button>
  ),
}));

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

vi.mock('@ui/layout/container/Container', () => ({
  default: ({
    children,
    description,
    label,
  }: {
    children: ReactNode;
    description?: string;
    label?: string;
  }) => (
    <main>
      <h1>{label}</h1>
      <p>{description}</p>
      {children}
    </main>
  ),
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
      topPlatforms: [
        {
          platform: 'tiktok',
          postCount: 3,
          totalEngagement: 500,
          totalViews: 9000,
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
        platforms: [],
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

    expect(screen.getByText('Viral Hooks')).toBeVisible();
    expect(await screen.findByText('Winning hook video')).toBeVisible();
    expect(
      screen.getByText('Analyze hooks and engagement patterns.'),
    ).toBeVisible();

    // Stat cards
    expect(screen.getByText('Posts Analyzed')).toBeVisible();
    expect(screen.getByText('Hook Patterns')).toBeVisible();
    expect(screen.getByText('TIKTOK')).toBeVisible();

    // Platform overview comes from `analysis.topPlatforms`
    expect(screen.getByText('Total Views: 9000')).toBeVisible();
    expect(screen.getByText('Total Engagement: 500')).toBeVisible();

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

  it('renders the page shell while hook data is loading', () => {
    mocks.getViralHooks.mockReturnValue(new Promise(() => {}));

    render(analyticsHooksTree());

    expect(screen.getByText('Viral Hooks')).toBeVisible();
    expect(
      screen.getByText('Analyze hooks and engagement patterns.'),
    ).toBeVisible();
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

    expect(await screen.findByText('Viral Hooks')).toBeVisible();
    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(screen.getAllByText('No data available').length).toBeGreaterThan(0);
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

    expect(screen.getByText('Viral Hooks')).toBeVisible();
    expect(mocks.getAnalyticsService).not.toHaveBeenCalled();

    mocks.organizationId = 'org-1';
    mocks.getViralHooks.mockRejectedValueOnce(new Error('hooks failed'));
    rerender(analyticsHooksTree());

    expect(await screen.findByText('Viral Hooks')).toBeVisible();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'GET /analytics/hooks failed',
      expect.any(Error),
    );
    expect(screen.getAllByText('N/A')).toHaveLength(2);
  });
});
