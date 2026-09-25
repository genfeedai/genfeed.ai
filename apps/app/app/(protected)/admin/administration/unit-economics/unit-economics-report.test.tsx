import type { IUnitEconomicsReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import UnitEconomicsReport from './unit-economics-report';
import {
  buildUnitEconomicsRange,
  buildUnitEconomicsTableRows,
  formatMarginPercent,
  formatUsd,
} from './unit-economics-report.util';

const metrics = {
  agentChatCredits: 0,
  agentTurns: 0,
  generationCredits: 0,
  grossMarginPercent: null,
  grossMarginUsd: 0,
  llmProviderCostUsd: 0,
  mediaProviderCostUsd: 0,
  revenueUsd: 0,
};

const report: IUnitEconomicsReport = {
  from: '2026-09-01T00:00:00.000Z',
  organizationId: null,
  organizationLabel: null,
  rows: [
    {
      ...metrics,
      agentChatCredits: 12.34,
      agentTurns: 40,
      grossMarginPercent: 80,
      grossMarginUsd: 80,
      id: 'org-paid',
      label: 'Paid Org',
      llmProviderCostUsd: 20,
      revenueUsd: 100,
      topModels: [{ model: 'anthropic/claude-sonnet-5', providerCostUsd: 18 }],
    },
    {
      ...metrics,
      agentChatCredits: 0.04,
      agentTurns: 3,
      grossMarginUsd: -0.0021,
      id: 'org-free',
      label: 'Free Org',
      llmProviderCostUsd: 0.0021,
      topModels: [],
    },
  ],
  to: '2026-09-30T23:59:59.999Z',
  totals: {
    ...metrics,
    agentChatCredits: 12.38,
    agentTurns: 43,
    grossMarginPercent: 80,
    grossMarginUsd: 79.9979,
    llmProviderCostUsd: 20.0021,
    revenueUsd: 100,
  },
};

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

const queryState = vi.hoisted(() => ({
  lastQueryKey: [] as unknown[],
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() => vi.fn()),
}));

vi.mock('@services/admin/unit-economics.service', () => ({
  AdminUnitEconomicsService: { getInstance: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
    queryState.lastQueryKey = queryKey;
    return {
      data: report,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    };
  }),
}));

describe('unit economics report helpers', () => {
  it('formats money, sub-dollar provider costs, and missing margins', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
    expect(formatUsd(0.0021)).toBe('$0.0021');
    expect(formatUsd(-12)).toBe('-$12.00');
    expect(formatMarginPercent(null)).toBe('—');
    expect(formatMarginPercent(98.456)).toBe('98.5%');
  });

  it('builds an inclusive UTC day range', () => {
    expect(
      buildUnitEconomicsRange(30, new Date('2026-09-30T12:00:00.000Z')),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('sorts rows and keeps the totals row last', () => {
    const ascending = buildUnitEconomicsTableRows(
      report,
      'revenueUsd',
      'asc',
      'Total',
    );
    expect(ascending.map((row) => row.id)).toEqual([
      'org-free',
      'org-paid',
      '__total__',
    ]);
    const byMargin = buildUnitEconomicsTableRows(
      report,
      'grossMarginPercent',
      'desc',
      'Total',
    );
    expect(byMargin.map((row) => row.id)).toEqual([
      'org-paid',
      'org-free',
      '__total__',
    ]);
    expect(byMargin.at(-1)).toEqual(
      expect.objectContaining({ isTotal: true, label: 'Total' }),
    );
  });
});

describe('UnitEconomicsReport', () => {
  it('renders organizations with credits, costs, margins, and a totals row', () => {
    render(<UnitEconomicsReport />);

    const paidRow = screen.getByText('Paid Org').closest('tr');
    expect(paidRow).not.toBeNull();
    const paid = within(paidRow as HTMLElement);
    expect(paid.getByText('$100.00')).toBeInTheDocument();
    expect(paid.getByText('12.3')).toBeInTheDocument();
    expect(paid.getByText('80.0%')).toBeInTheDocument();
    expect(paid.getByText('anthropic/claude-sonnet-5')).toBeInTheDocument();

    const freeRow = screen.getByText('Free Org').closest('tr');
    const free = within(freeRow as HTMLElement);
    expect(free.getByText('<0.1')).toBeInTheDocument();
    expect(free.getByText('-$0.0021')).toBeInTheDocument();
    expect(free.getByText('—', { selector: 'span' })).toBeInTheDocument();

    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('drills into an organization by user', () => {
    render(<UnitEconomicsReport />);

    fireEvent.click(screen.getByText('Paid Org'));

    expect(queryState.lastQueryKey).toContain('org-paid');
    expect(
      screen.getByRole('button', { name: /All organizations/ }),
    ).toBeInTheDocument();
  });
});
