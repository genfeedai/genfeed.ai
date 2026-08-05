import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsUsagePage from './content';

const { mockGetUsageMetrics, mockListTransactions, mockUseQuery } = vi.hoisted(
  () => ({
    mockGetUsageMetrics: vi.fn(),
    mockListTransactions: vi.fn(),
    mockUseQuery: vi.fn(),
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: [{ id: 'brand-1', label: 'Demo', slug: 'demo' }],
    isReady: true,
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    getUsageMetrics: mockGetUsageMetrics,
    listTransactions: mockListTransactions,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) => mockUseQuery(options),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

describe('SettingsUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      const key = String(options.queryKey[0] ?? '');
      if (key.includes('metrics')) {
        return {
          data: {
            breakdown: [{ amount: 12, count: 3, source: 'Agent chat turn' }],
            currentBalance: 88,
            dailySeries: [
              { amount: 4, date: '2026-07-30' },
              { amount: 8, date: '2026-07-31' },
            ],
            monthlySeries: [{ amount: 40, date: '2026-07-01' }],
            trendPercentage: 5,
            usage30Days: 40,
            usage7Days: 12,
            weeklySeries: [{ amount: 12, date: '2026-07-28' }],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }
      return {
        data: [
          {
            amount: -1,
            balanceAfter: 87,
            category: 'DEDUCT',
            createdAt: '2026-08-01T00:00:00.000Z',
            description: 'Agent chat turn (openai/gpt-5.6-terra)',
            id: 'tx-1',
            metadata: { brandId: 'brand-1' },
            source: 'SCRIPT',
          },
        ],
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it('renders usage metrics and ledger rows', () => {
    render(<SettingsUsagePage />);

    expect(screen.getByText('Usage')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('Used (7 days)')).toBeInTheDocument();
    expect(screen.getByText('Usage over time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Daily' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weekly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monthly' })).toBeInTheDocument();
    expect(
      screen.getByText('Agent chat turn (openai/gpt-5.6-terra)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Brand')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Refresh/i }),
    ).toBeInTheDocument();
    // Populated path — empty chart copy is only for zero series.
    expect(
      screen.queryByText('No credit activity yet'),
    ).not.toBeInTheDocument();
  });
});
