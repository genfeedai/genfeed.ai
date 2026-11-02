import type { IEconomicsCostReport } from '@genfeedai/contracts/interfaces';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import EconomicsCostsReport from './costs-report';

const report: IEconomicsCostReport = {
  daily: [{ date: '2026-09-02', llmCostUsd: 1.5, mediaCostUsd: 0.5 }],
  from: '2026-09-01',
  mediaCategories: [
    {
      category: 'IMAGE',
      costPerGenerationUsd: 0.25,
      costUsd: 0.5,
      generations: 3,
      pricedGenerations: 2,
    },
    {
      category: 'VIDEO',
      costPerGenerationUsd: null,
      costUsd: 0,
      generations: 1,
      pricedGenerations: 0,
    },
  ],
  models: [
    {
      averageCostUsd: 0.3,
      byokCalls: 0,
      calls: 5,
      completionTokens: 2_000,
      costUsd: 1.5,
      kind: 'llm',
      model: 'anthropic/claude-sonnet-5',
      promptTokens: 10_000,
      provider: 'openrouter',
      unpricedCalls: 0,
    },
    {
      averageCostUsd: 0.5,
      byokCalls: 0,
      calls: 1,
      completionTokens: 0,
      costUsd: 0.5,
      kind: 'media',
      model: 'black-forest-labs/flux-schnell',
      promptTokens: 0,
      provider: 'replicate',
      unpricedCalls: 2,
    },
  ],
  to: '2026-09-30',
  totals: {
    byokCalls: 3,
    costPerGenerationUsd: 0.25,
    llmCalls: 5,
    llmCostUsd: 1.5,
    mediaCostUsd: 0.5,
    mediaGenerations: 4,
    mediaPricedGenerations: 2,
    providerCostUsd: 2,
    unpricedCalls: 2,
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

vi.mock('@/components/analytics/charts/series/series-chart', () => ({
  SeriesChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} />
  ),
}));

describe('EconomicsCostsReport', () => {
  it('shows cost per model with tokens, and flags unpriced calls', () => {
    render(<EconomicsCostsReport />);

    const llmRow = screen
      .getByText('anthropic/claude-sonnet-5')
      .closest('tr') as HTMLElement;
    const llm = within(llmRow);
    expect(llm.getByText('openrouter')).toBeInTheDocument();
    expect(llm.getByText('10,000 / 2,000')).toBeInTheDocument();
    expect(llm.getByText('$1.50')).toBeInTheDocument();

    const mediaRow = screen
      .getByText('black-forest-labs/flux-schnell')
      .closest('tr') as HTMLElement;
    expect(within(mediaRow).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('IMAGE')).toBeInTheDocument();
  });

  it('shows cost per generation as a tile and per media type, with a dash when nothing was priced', () => {
    render(<EconomicsCostsReport />);

    const tile = screen
      .getByText('Cost per generation', { selector: 'p' })
      .closest('[data-testid="metric-card"]') as HTMLElement;
    expect(within(tile).getByText('$0.25')).toBeInTheDocument();

    const imageRow = screen.getByText('IMAGE').closest('tr') as HTMLElement;
    expect(within(imageRow).getByText('$0.25')).toBeInTheDocument();
    const videoRow = screen.getByText('VIDEO').closest('tr') as HTMLElement;
    expect(within(videoRow).getByText('-')).toBeInTheDocument();
  });

  it('counts unpriced calls on a tile that holds only a value and a label', () => {
    render(<EconomicsCostsReport />);

    expect(screen.getByText('Unpriced calls')).toBeInTheDocument();
    expect(screen.queryByText(/BYOK calls are free/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recorded at \$0/)).not.toBeInTheDocument();
  });
});
