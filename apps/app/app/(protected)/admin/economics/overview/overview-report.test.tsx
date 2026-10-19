import type { IEconomicsOverviewReport } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import EconomicsOverviewReport from './overview-report';

const totals = {
  activeOrganizations: 3,
  creditsConsumed: 2_000,
  creditValueUsd: 20,
  grossMarginPercent: 80,
  grossMarginUsd: 16,
  llmCalls: 10,
  llmCostUsd: 1.25,
  mediaCostUsd: 2.75,
  mediaGenerations: 4,
  payingOrganizations: 1,
  pricingMarginPercent: 80,
  pricingMarginUsd: 16,
  providerCostUsd: 4,
  revenueEvents: 2,
  revenueUsd: 20,
};

const report: IEconomicsOverviewReport = {
  daily: [
    {
      creditValueUsd: 1,
      date: '2026-09-01',
      llmCostUsd: 0.5,
      mediaCostUsd: 0,
      revenueUsd: 10,
    },
  ],
  from: '2026-09-01',
  previousFrom: '2026-08-02',
  previousTo: '2026-08-31',
  previousTotals: { ...totals, revenueUsd: 0, creditValueUsd: 10 },
  to: '2026-09-30',
  totals,
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('../use-economics-report', () => ({
  useEconomicsReport: vi.fn(() => ({
    data: report,
    error: null,
    isFetching: false,
    isLoading: false,
    periodDays: '30',
    refetch: vi.fn(),
    setPeriodDays: vi.fn(),
  })),
}));

vi.mock('@ui/analytics/charts/series/series-chart', () => ({
  SeriesChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

describe('EconomicsOverviewReport', () => {
  it('shows revenue, cost and both margins against the previous period', () => {
    render(<EconomicsOverviewReport />);

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Gross margin')).toBeInTheDocument();
    expect(screen.getByText('80.0% of revenue')).toBeInTheDocument();
    expect(screen.getByText('Pricing margin')).toBeInTheDocument();
    expect(screen.getByText('80.0% of credit value')).toBeInTheDocument();
    expect(
      screen.getByText('LLM $1.25 · generation $2.75'),
    ).toBeInTheDocument();
    expect(screen.getByText('+100%')).toBeInTheDocument();
    expect(screen.getByText('vs $10.00')).toBeInTheDocument();
  });

  it('draws the revenue and credit charts', () => {
    render(<EconomicsOverviewReport />);

    expect(
      screen.getByRole('img', { name: 'Revenue and provider cost per day' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', {
        name: 'Credit value consumed and provider cost per day',
      }),
    ).toBeInTheDocument();
  });
});
