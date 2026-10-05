'use client';

import type { AdminModelPricingRow } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModelPricingAttentionPanel from './model-pricing-attention-panel';
import ModelPricingTable from './model-pricing-table';

const fixture = vi.hoisted(() => ({
  approveRates: vi.fn(),
  getReport: vi.fn(),
  getService: vi.fn(),
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => fixture.getService,
}));
vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import(
    '../../../../../../tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) => translateFromCatalog(namespace),
  };
});
vi.mock('@services/admin/model-pricing.service', () => ({
  AdminModelPricingService: { getInstance: vi.fn() },
}));

function row(overrides: Partial<AdminModelPricingRow>): AdminModelPricingRow {
  return {
    attention: [],
    attentionLevel: null,
    category: 'video',
    configuredCost: 0,
    configuredCostPerUnit: null,
    configuredMinCost: null,
    configuredProviderCostUsd: null,
    dimensions: {},
    effectiveSampleCredits: 64,
    effectiveUnitCredits: null,
    id: 'clean',
    inputCostPerMillionTokens: null,
    isActive: true,
    isFree: false,
    isRateApprovalAvailable: false,
    key: 'clean/model',
    lifecycle: 'AVAILABLE',
    outputCostPerMillionTokens: null,
    pending: null,
    pendingRateChanges: [],
    pricingType: 'flat',
    provider: 'replicate',
    providerPricingSyncedAt: null,
    providerSyncFailureCode: null,
    providerSyncStatus: 'fresh',
    reasons: [],
    reviewed: null,
    sampleDuration: null,
    status: 'verified',
    ...overrides,
  };
}

function report(rows: AdminModelPricingRow[]) {
  return {
    id: 'model-pricing',
    isConversionPolicyConfigured: true,
    marginMultiplierGeneration: 3.33,
    retrievedAt: '2026-10-05T00:00:00Z',
    rows,
    source: 'https://api.example/v1/admin/model-pricing',
  };
}

const red = row({
  attention: [
    {
      code: 'price_missing',
      level: 'red',
      reason: 'Selected variant requires reviewed provider rates',
    },
  ],
  attentionLevel: 'red',
  id: 'red',
  key: 'genfeed-ai/z-image-turbo',
});
const orange = row({
  attention: [
    {
      code: 'price_change_pending',
      level: 'orange',
      reason: 'The provider changed its price',
    },
  ],
  attentionLevel: 'orange',
  id: 'orange',
  isRateApprovalAvailable: true,
  key: 'minimax/hailuo-2.3-fast',
  pending: {
    billingUnit: 'output',
    conditionalDimensions: {},
    currency: 'USD',
    mappingStatus: 'supported',
    observedAt: '2026-10-05T00:00:00Z',
    rates: null,
    reviewStatus: 'pending',
    source: 'replicate-billing-config',
    sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
    unitPrice: null,
    verifiedAt: '2026-10-05T00:00:00Z',
    version: 'rates-v2',
  },
  pendingRateChanges: [
    {
      component: 'video_output_count',
      newPriceUsd: 0.21,
      oldPriceUsd: 0.19,
      unit: 'output',
      variant: 'duration=6 · resolution=768P',
    },
  ],
});

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ModelPricingAttentionPanel />
      <ModelPricingTable />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.getService.mockResolvedValue(fixture);
  fixture.getReport.mockResolvedValue(report([red, orange, row({})]));
  fixture.approveRates.mockResolvedValue(report([red, row({})]));
});

describe('model pricing attention (#6196)', () => {
  it('lists red then orange models with their reasons and badges the table rows', async () => {
    show();

    const panel = await screen.findByTestId('model-pricing-attention');
    expect(panel).toHaveTextContent('1 model cannot be priced');
    expect(screen.getByTestId('model-pricing-attention-red')).toHaveTextContent(
      'genfeed-ai/z-image-turbo',
    );
    expect(
      screen.getByTestId('model-pricing-attention-orange'),
    ).toHaveTextContent('The provider changed its price');
    expect(
      panel
        .querySelector('[data-testid="model-pricing-attention-red"]')
        ?.compareDocumentPosition(
          panel.querySelector(
            '[data-testid="model-pricing-attention-orange"]',
          ) as Node,
        ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(await screen.findByText('Price missing')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('approves the pending price only after an explicit confirmation', async () => {
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve new price' }),
    );
    expect(fixture.approveRates).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

    await waitFor(() =>
      expect(fixture.approveRates).toHaveBeenCalledWith('orange', 'rates-v2'),
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('model-pricing-attention-orange'),
      ).not.toBeInTheDocument(),
    );
  });

  it('offers Approve with a terms-changed line when only billing terms changed', async () => {
    fixture.getReport.mockResolvedValue(
      report([{ ...orange, id: 'terms', pendingRateChanges: [] }]),
    );
    show();

    expect(
      await screen.findByRole('button', { name: 'Approve new price' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Billing terms changed')).toBeInTheDocument();
  });

  it('shows old and new prices per variant', async () => {
    show();

    expect(
      await screen.findByText('duration=6 · resolution=768P: $0.19 → $0.21'),
    ).toBeInTheDocument();
  });

  it('asks the operator to reload when the rates changed under them (409)', async () => {
    fixture.approveRates.mockRejectedValueOnce({ response: { status: 409 } });
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Approve new price' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm approval' }));

    expect(
      await screen.findByText(
        'Rates changed. Reload and review the new rates.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(fixture.getReport).toHaveBeenCalledTimes(2));
  });
});
