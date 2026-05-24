import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsHooks from './analytics-hooks';

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

vi.mock('@genfeedai/helpers', () => ({
  formatDuration: (seconds: number) => `${seconds}s`,
}));

vi.mock('@helpers/formatting/date/date.helper', () => ({
  formatDate: (value: string) => `date:${value}`,
}));

vi.mock('@helpers/formatting/format/format.helper', () => ({
  formatCompactNumber: (value: number) => `${value}`,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getAnalyticsService,
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

vi.mock('@ui/cards/stat-card/StatCard', () => ({
  default: ({ label, value }: { label: string; value: ReactNode }) => (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
    items,
  }: {
    columns: Array<{
      header: string;
      render?: (item: T) => ReactNode;
    }>;
    getRowKey: (item: T) => string;
    items: T[];
  }) => (
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
  ),
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

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div data-testid="loading">Loading</div>,
}));

function hookResponse() {
  return {
    analysis: {
      avgTimePerVideo: 450,
      hookEffectiveness: [{ avgEffectiveness: 82, count: 3, type: 'visual' }],
      topHooks: ['Open with a pattern interrupt'],
      topPlatforms: [{ platform: 'tiktok' }],
      totalTime: 5400,
      totalVideos: 2,
    },
    videos: [
      {
        creator: 'Creator One',
        duration: 42,
        hooks: [
          { effectiveness: 80, type: 'visual' },
          { effectiveness: 60, type: 'verbal' },
        ],
        id: 'video-1',
        platforms: [
          {
            comments: 10,
            engagementRate: 8.5,
            likes: 200,
            platform: 'tiktok',
            shares: 20,
            views: 1000,
            viralScore: 88,
          },
          {
            comments: 4,
            engagementRate: 5.5,
            likes: 120,
            platform: 'instagram',
            shares: 5,
            views: 600,
            viralScore: 64,
          },
        ],
        title: 'Winning hook video',
        totalTimeTracked: 3720,
        uploadDate: '2026-05-01',
      },
      {
        creator: 'Creator Two',
        duration: 20,
        hooks: [],
        id: 'video-2',
        platforms: [],
        title: 'No platform data video',
        totalTimeTracked: 45,
        uploadDate: '2026-05-02',
      },
    ],
  };
}

describe('AnalyticsHooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.organizationId = 'org-1';
    mocks.getViralHooks.mockResolvedValue(hookResponse());
    mocks.getAnalyticsService.mockResolvedValue({
      getViralHooks: mocks.getViralHooks,
    });
  });

  it('renders hook analytics and refreshes with brand query params', async () => {
    render(<AnalyticsHooks />);

    expect(screen.getByTestId('loading')).toBeVisible();
    expect(await screen.findByText('Viral Hooks')).toBeVisible();
    expect(
      screen.getByText('Analyze hooks and engagement patterns.'),
    ).toBeVisible();
    expect(screen.getByText('Total Videos Analyzed')).toBeVisible();
    expect(screen.getByText('1h 30m')).toBeVisible();
    expect(screen.getByText('7m')).toBeVisible();
    expect(screen.getByText('TIKTOK')).toBeVisible();
    expect(screen.getAllByText('TikTok').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 videos').length).toBeGreaterThan(0);
    expect(screen.getByText('Total Views: 1000')).toBeVisible();
    expect(screen.getByText('Avg Engagement: 8.5%')).toBeVisible();
    expect(screen.getByText('Winning hook video')).toBeVisible();
    expect(screen.getByText('Creator One • date:2026-05-01')).toBeVisible();
    expect(screen.getByText('42s')).toBeVisible();
    expect(screen.getByText('2 hooks')).toBeVisible();
    expect(screen.getByText('Avg: 70% effective')).toBeVisible();
    expect(screen.getAllByText('TikTok').length).toBeGreaterThan(0);
    expect(screen.getByText('1000 views')).toBeVisible();
    expect(screen.getByText('Score: 88')).toBeVisible();
    expect(screen.getByText('No platform data')).toBeVisible();
    expect(screen.getByText('visual Hooks')).toBeVisible();
    expect(screen.getByText('Open with a pattern interrupt')).toBeVisible();
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

  it('uses an explicit brand id and renders default empty data', async () => {
    mocks.getViralHooks.mockResolvedValueOnce({});

    render(<AnalyticsHooks brandId="brand-prop" />);

    expect(await screen.findByText('Viral Hooks')).toBeVisible();
    expect(screen.getByText('N/A')).toBeVisible();
    expect(screen.getAllByText('No data available').length).toBeGreaterThan(0);
    expect(screen.getByText('visual Hooks')).toBeVisible();
    expect(
      screen.getByText('No top hook patterns detected yet.'),
    ).toBeVisible();
    expect(mocks.getViralHooks).toHaveBeenCalledWith(
      expect.objectContaining({ brand: 'brand-prop' }),
    );
  });

  it('does not fetch without organization context and resets on failures', async () => {
    mocks.organizationId = null;
    const { rerender } = render(<AnalyticsHooks />);

    expect(screen.getByTestId('loading')).toBeVisible();
    expect(mocks.getAnalyticsService).not.toHaveBeenCalled();

    mocks.organizationId = 'org-1';
    mocks.getViralHooks.mockRejectedValueOnce(new Error('hooks failed'));
    rerender(<AnalyticsHooks />);

    expect(await screen.findByText('Viral Hooks')).toBeVisible();
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'GET /analytics/hooks failed',
      expect.any(Error),
    );
    expect(screen.getByText('N/A')).toBeVisible();
  });
});
