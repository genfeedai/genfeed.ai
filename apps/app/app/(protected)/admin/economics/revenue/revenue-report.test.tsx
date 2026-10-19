import type { IEconomicsRevenueReport } from '@genfeedai/contracts/interfaces';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import EconomicsRevenueReport from './revenue-report';

const report: IEconomicsRevenueReport = {
  daily: [{ creditPackUsd: 10, date: '2026-09-03', subscriptionUsd: 29 }],
  from: '2026-09-01',
  latestEvents: [
    {
      amountUsd: 29,
      id: 'rev-1',
      occurredAt: '2026-09-03T10:00:00.000Z',
      organizationId: 'org-1',
      organizationLabel: 'Acme',
      source: 'subscription_invoice',
      stripeObjectId: 'in_123',
    },
  ],
  latestEventsLimit: 50,
  ledgerStartedAt: '2026-09-02T09:00:00.000Z',
  nonUsdEvents: 2,
  sources: [{ events: 1, revenueUsd: 29, source: 'subscription_invoice' }],
  to: '2026-09-30',
  topOrganizations: [{ events: 1, id: 'org-1', label: 'Acme', revenueUsd: 29 }],
  totals: {
    averageRevenuePerEventUsd: 19.5,
    events: 2,
    payingOrganizations: 2,
    revenueUsd: 39,
  },
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

describe('EconomicsRevenueReport', () => {
  it('warns when the ledger starts after the period and drops non-USD payments', () => {
    render(<EconomicsRevenueReport />);

    expect(
      screen.getByText(
        'The revenue ledger starts on 2026-09-02. Stripe payments before that day are not in this report.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 payments in another currency are left out of these totals.',
      ),
    ).toBeInTheDocument();
  });

  it('lists top organizations and the latest payments with their Stripe object', () => {
    render(<EconomicsRevenueReport />);

    expect(screen.getByText('$39.00')).toBeInTheDocument();
    expect(screen.getByText('Latest 50 payments')).toBeInTheDocument();
    expect(screen.getByText('in_123')).toBeInTheDocument();
    expect(screen.getByText('Subscription')).toBeInTheDocument();
    expect(screen.getAllByText('Acme')).toHaveLength(2);
  });
});
