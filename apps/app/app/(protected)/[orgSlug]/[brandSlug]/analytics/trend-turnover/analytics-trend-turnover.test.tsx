import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsTrendTurnover from './analytics-trend-turnover';

const mocks = vi.hoisted(() => ({
  getService: vi.fn(),
  getTurnoverStats: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mocks.getService,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.loggerError,
  },
}));

vi.mock('@services/social/trends.service', () => ({
  TrendsService: {
    getInstance: vi.fn(),
  },
}));

vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({
      data,
      isLoading,
    }: {
      data: Array<Record<string, unknown>>;
      isLoading: boolean;
    }) => (
      <div data-loading={String(isLoading)} data-testid="trend-flow-chart">
        chart rows {data.length}
      </div>
    ),
}));

vi.mock('@ui-constants/platform.constant', () => ({
  PLATFORM_CONFIGS: {
    instagram: {
      color: '#e1306c',
      icon: ({ style }: { style?: React.CSSProperties }) => (
        <span data-testid="instagram-icon" style={style} />
      ),
      label: 'Instagram',
    },
    tiktok: {
      color: '#111111',
      icon: ({ style }: { style?: React.CSSProperties }) => (
        <span data-testid="tiktok-icon" style={style} />
      ),
      label: 'TikTok',
    },
  },
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children, label }: { children?: ReactNode; label?: string }) => (
    <section>
      <h2>{label}</h2>
      {children}
    </section>
  ),
}));

vi.mock('@ui/display/table/Table', () => ({
  default: ({
    columns,
    emptyLabel,
    isLoading,
    items,
  }: {
    columns: Array<{
      header: string;
      key: string;
      render?: (item: Record<string, unknown>) => ReactNode;
    }>;
    emptyLabel?: string;
    isLoading?: boolean;
    items: Array<Record<string, unknown>>;
  }) => {
    if (isLoading) {
      return <div>Loading table</div>;
    }

    if (items.length === 0) {
      return <div>{emptyLabel}</div>;
    }

    return (
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={String(item.platform)}>
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(item)
                    : String(item[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

vi.mock('@ui/kpi/kpi-section/KPISection', () => ({
  default: ({
    isLoading,
    items,
  }: {
    isLoading?: boolean;
    items: Array<{ label: string; value: ReactNode }>;
  }) => (
    <section data-loading={String(Boolean(isLoading))}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  ),
}));

vi.mock('@ui/layout/stack', () => ({
  VStack: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children?: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@ui/typography/heading', () => ({
  Heading: ({
    as: Component = 'h2',
    children,
  }: {
    as?: keyof JSX.IntrinsicElements;
    children?: ReactNode;
  }) => <Component>{children}</Component>,
}));

vi.mock('@ui/typography/text', () => ({
  Text: ({
    as: Component = 'p',
    children,
  }: {
    as?: keyof JSX.IntrinsicElements;
    children?: ReactNode;
  }) => <Component>{children}</Component>,
}));

const turnoverResponse = {
  byPlatform: [
    {
      alive: 3,
      appeared: 12,
      avgLifespanDays: 4.25,
      died: 7,
      platform: 'instagram',
      turnoverRate: 72,
    },
    {
      alive: 6,
      appeared: 9,
      avgLifespanDays: 8,
      died: 2,
      platform: 'unknown',
      turnoverRate: 22,
    },
  ],
  timeline: [
    { appeared: 4, date: '2026-05-18', died: 1 },
    { appeared: 8, date: '2026-05-19', died: 6 },
  ],
  totals: {
    appeared: 21,
    avgLifespanDays: 6.2,
    died: 9,
    turnoverRate: 43,
  },
};

describe('AnalyticsTrendTurnover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTurnoverStats.mockResolvedValue(turnoverResponse);
    mocks.getService.mockResolvedValue({
      getTurnoverStats: mocks.getTurnoverStats,
    });
  });

  it('loads trend turnover KPIs, chart, table, and volatility bars', async () => {
    render(<AnalyticsTrendTurnover />);

    expect(screen.getByText('Trend Turnover Dashboard')).toBeVisible();
    expect(screen.getByText('Loading table')).toBeVisible();

    await waitFor(() => {
      expect(mocks.getTurnoverStats).toHaveBeenCalledWith(30);
    });

    expect(await screen.findByText('21')).toBeVisible();
    expect(screen.getAllByText('9').length).toBeGreaterThan(0);
    expect(screen.getByText('6.2d')).toBeVisible();
    expect(screen.getByText('43%')).toBeVisible();
    expect(screen.getByTestId('trend-flow-chart')).toHaveTextContent(
      'chart rows 2',
    );
    expect(screen.getAllByText('Instagram').length).toBeGreaterThan(0);
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0);
    expect(screen.getByText('4.3d')).toBeVisible();
    expect(screen.getByText('8.0d')).toBeVisible();

    fireEvent.click(screen.getByText('7D'));
    await waitFor(() => {
      expect(mocks.getTurnoverStats).toHaveBeenCalledWith(7);
    });
  });

  it('renders empty data and logs non-abort failures', async () => {
    mocks.getTurnoverStats
      .mockResolvedValueOnce({
        byPlatform: [],
        timeline: [],
        totals: {
          appeared: 0,
          avgLifespanDays: 0,
          died: 0,
          turnoverRate: 0,
        },
      })
      .mockRejectedValueOnce(new Error('network down'));

    render(<AnalyticsTrendTurnover />);

    expect(
      await screen.findByText('No trend data for this period'),
    ).toBeVisible();
    expect(
      screen.getByText('No platform data available for this period.'),
    ).toBeVisible();

    fireEvent.click(screen.getByText('90D'));
    await waitFor(() => {
      expect(mocks.loggerError).toHaveBeenCalledWith(
        'Failed to fetch trend turnover data',
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });
  });
});
