import type { IUnitEconomicsReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildEconomicsRange,
  formatMarginPercent,
  formatUsd,
} from '../economics-report.util';
import UnitEconomicsReport from './unit-economics-report';
import { buildUnitEconomicsTableRows } from './unit-economics-report.util';

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
  pagination: { limit: 25, page: 1, pages: 1, total: 2 },
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
  lastQueryFn: undefined as
    | undefined
    | ((context: { signal: AbortSignal }) => Promise<unknown>),
  getReport: vi.fn(),
  lastQueryKey: [] as unknown[],
  replace: vi.fn(),
  search: '',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/administration/unit-economics',
  useRouter: () => ({ replace: queryState.replace }),
  useSearchParams: () => new URLSearchParams(queryState.search),
}));

vi.mock('@contexts/ui/context-sidebar-context', () => ({
  ContextSidebarPanel: ({
    children,
    selection,
  }: {
    children: ReactNode;
    selection: { title: string } | null;
  }) =>
    selection ? (
      <aside aria-label="Context sidebar">
        <h2>{selection.title}</h2>
        {children}
      </aside>
    ) : null,
}));

vi.mock('@ui/navigation/pagination/auto-pagination/AutoPagination', () => ({
  default: ({ totalLabel }: { totalLabel: string }) => (
    <nav aria-label="pagination" data-total-label={totalLabel} />
  ),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn(() =>
    vi.fn(async () => ({ getReport: queryState.getReport })),
  ),
}));

vi.mock('@services/admin/unit-economics.service', () => ({
  AdminUnitEconomicsService: { getInstance: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(
    ({
      queryFn,
      queryKey,
    }: {
      queryFn: typeof queryState.lastQueryFn;
      queryKey: unknown[];
    }) => {
      queryState.lastQueryFn = queryFn;
      queryState.lastQueryKey = queryKey;
      return {
        data: report,
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    },
  ),
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
      buildEconomicsRange(30, new Date('2026-09-30T12:00:00.000Z')),
    ).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('keeps the API order and pins the report-wide totals row last', () => {
    const rows = buildUnitEconomicsTableRows(report, 'Total');

    expect(rows.map((row) => row.id)).toEqual([
      'org-paid',
      'org-free',
      '__total__',
    ]);
    expect(rows.at(-1)).toEqual(
      expect.objectContaining({ isTotal: true, label: 'Total' }),
    );
    expect(buildUnitEconomicsTableRows(undefined, 'Total')).toEqual([]);
    expect(
      buildUnitEconomicsTableRows({ ...report, rows: [] }, 'Total'),
    ).toEqual([]);
  });
});

describe('UnitEconomicsReport', () => {
  beforeEach(() => {
    queryState.search = '';
    queryState.replace.mockClear();
    queryState.getReport.mockReset();
  });

  it('renders organizations with credits, costs, margins, and a totals row', async () => {
    render(<UnitEconomicsReport />);

    expect(screen.getByText('Unit Economics')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /Organization/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(
      await screen.findByRole('menuitem', { name: /^Report period/ }),
    ).toHaveTextContent('Last 30 days');
    await userEvent.keyboard('{Escape}');

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
    // No margin % without revenue, and no "Free" for zero generation credits.
    expect(free.getAllByText('—', { selector: 'span' }).length).toBeGreaterThan(
      1,
    );
    expect(free.queryByText('Free')).not.toBeInTheDocument();

    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('opens the row in the context sidebar and links the name to its spending', () => {
    render(<UnitEconomicsReport />);

    const nameLink = screen.getByRole('link', {
      name: 'Open spending for Paid Org',
    });
    expect(nameLink).toHaveAttribute(
      'href',
      '/admin/organizations/org-paid/spending',
    );

    const paidRow = screen.getByText('Paid Org').closest('tr') as HTMLElement;
    fireEvent.click(within(paidRow).getByText('80.0%'));

    const sidebar = screen.getByRole('complementary', {
      name: 'Context sidebar',
    });
    expect(
      within(sidebar).getByRole('heading', { name: 'Paid Org' }),
    ).toBeInTheDocument();
    expect(within(sidebar).getByText('Gross margin')).toBeInTheDocument();
    expect(within(sidebar).getByText('$80.00')).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: 'Open spending' }),
    ).toHaveAttribute('href', '/admin/organizations/org-paid/spending');
    expect(queryState.lastQueryKey).toContain('organizations');
  });

  it('shows the totals in the sidebar without a page to open', () => {
    render(<UnitEconomicsReport />);

    fireEvent.click(screen.getByText('Total'));

    const sidebar = screen.getByRole('complementary', {
      name: 'Context sidebar',
    });
    expect(within(sidebar).getByText('43')).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: 'Open spending' }),
    ).not.toBeInTheDocument();
  });

  it('asks the API for one page, sorted by the selected column', async () => {
    queryState.search = 'page=3';
    render(<UnitEconomicsReport />);

    await queryState.lastQueryFn?.({ signal: new AbortController().signal });

    expect(queryState.getReport).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 15,
        page: 3,
        sortDirection: 'desc',
        sortKey: 'llmProviderCostUsd',
      }),
      expect.any(AbortSignal),
    );
    expect(queryState.lastQueryKey).toContain(3);
  });

  it('renders pagination under the table and labels what is counted', () => {
    render(<UnitEconomicsReport />);

    expect(screen.getByLabelText('pagination')).toHaveAttribute(
      'data-total-label',
      'organizations',
    );
  });

  it('starts over at page 1 when the sort changes', () => {
    queryState.search = 'page=4&foo=bar';
    render(<UnitEconomicsReport />);

    fireEvent.click(
      within(screen.getByRole('columnheader', { name: /Revenue/ })).getByRole(
        'button',
      ),
    );

    expect(queryState.replace).toHaveBeenCalledWith(
      '/admin/administration/unit-economics?foo=bar',
      { scroll: false },
    );
  });
});
