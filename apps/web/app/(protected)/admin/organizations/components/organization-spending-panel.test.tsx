import type { IUnitEconomicsReport } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import OrganizationSpendingPanel from './organization-spending-panel';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

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
  from: '2026-10-01T00:00:00.000Z',
  organizationId: 'org-1',
  organizationLabel: 'Acme Inc',
  pagination: { limit: 15, page: 1, pages: 1, total: 1 },
  rows: [
    {
      ...metrics,
      agentChatCredits: 120,
      agentTurns: 40,
      grossMarginPercent: 80,
      grossMarginUsd: 80,
      id: 'user-1',
      label: 'ada@example.com',
      llmProviderCostUsd: 15,
      mediaProviderCostUsd: 5,
      revenueUsd: 100,
      topModels: [{ model: 'anthropic/claude-sonnet-5', providerCostUsd: 15 }],
    },
  ],
  to: '2026-10-30T23:59:59.999Z',
  totals: {
    ...metrics,
    agentChatCredits: 120,
    agentTurns: 40,
    generationCredits: 30,
    grossMarginPercent: 80,
    grossMarginUsd: 80,
    llmProviderCostUsd: 15,
    mediaProviderCostUsd: 5,
    revenueUsd: 100,
  },
};

function renderPanel(
  props: Partial<ComponentProps<typeof OrganizationSpendingPanel>> = {},
) {
  return render(
    <OrganizationSpendingPanel
      error={null}
      isLoading={false}
      onSortChange={vi.fn()}
      report={report}
      sortDirection="desc"
      sortKey="llmProviderCostUsd"
      {...props}
    />,
  );
}

describe('OrganizationSpendingPanel', () => {
  it("shows the organization's revenue, provider cost, margin and credits", () => {
    renderPanel();

    // The revenue card and the user's row.
    expect(screen.getAllByText('$100.00')).toHaveLength(2);
    expect(
      screen.getByText('LLM $15.00 · generation $5.00'),
    ).toBeInTheDocument();
    expect(screen.getByText('80.0% of revenue')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(
      screen.getByText('120 agent chat · 30 generation'),
    ).toBeInTheDocument();
  });

  it('lists the users and opens one in the context sidebar', () => {
    renderPanel();

    expect(screen.getByLabelText('pagination')).toHaveAttribute(
      'data-total-label',
      'users',
    );
    const row = screen
      .getByText('ada@example.com')
      .closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByText('80.0%'));

    const sidebar = screen.getByRole('complementary', {
      name: 'Context sidebar',
    });
    expect(
      within(sidebar).getByRole('heading', { name: 'ada@example.com' }),
    ).toBeInTheDocument();
    expect(
      within(sidebar).getByText('anthropic/claude-sonnet-5'),
    ).toBeInTheDocument();
    expect(
      within(sidebar).queryByRole('link', { name: 'Open spending' }),
    ).not.toBeInTheDocument();
  });

  it('says so when the report fails to load', () => {
    renderPanel({ error: new Error('boom'), report: undefined });

    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
