'use client';

import type { AdminModelPricingRow } from '@genfeedai/contracts/interfaces';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { ModelsListProps } from '@props/admin/models.props';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminModelsPageContent from './admin-models-page-content';
import ModelPricingAttentionPanel from './model-pricing-attention-panel';
import ModelPricingDetails from './model-pricing-details';

const listProps = vi.hoisted(() => ({
  current: undefined as ModelsListProps | undefined,
}));
const fixture = vi.hoisted(() => ({
  approveRates: vi.fn(),
  fixPricing: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  openConfirm: vi.fn(),
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
vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({ openConfirm: fixture.openConfirm }),
}));
vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: fixture.notifyError,
      success: fixture.notifySuccess,
    }),
  },
}));
vi.mock('@pages/models/list/models-list', () => ({
  default: (props: ModelsListProps) => {
    listProps.current = props;
    return null;
  },
}));
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

function show(modelId = 'orange') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ModelPricingAttentionPanel />
      <ModelPricingDetails modelId="red" />
      <ModelPricingDetails modelId={modelId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.getService.mockResolvedValue(fixture);
  fixture.getReport.mockResolvedValue(report([red, orange, row({})]));
  fixture.approveRates.mockResolvedValue(report([red, row({})]));
  fixture.fixPricing.mockResolvedValue({
    approved: [],
    changed: [],
    repaired: [],
    syncQueued: [],
    unresolved: [],
  });
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
    show('terms');

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

describe('fix all pricing', () => {
  it('asks for confirmation, then fixes every model that needs it', async () => {
    fixture.fixPricing.mockResolvedValue({
      approved: [{ id: 'orange', key: 'minimax/hailuo-2.3-fast' }],
      changed: [],
      repaired: [],
      syncQueued: [],
      unresolved: [],
    });
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Fix all pricing' }),
    );
    expect(fixture.fixPricing).not.toHaveBeenCalled();
    expect(fixture.openConfirm).toHaveBeenCalledTimes(1);
    await fixture.openConfirm.mock.calls[0][0].onConfirm();

    await waitFor(() =>
      expect(fixture.fixPricing).toHaveBeenCalledWith(undefined),
    );
    await waitFor(() =>
      expect(fixture.notifySuccess).toHaveBeenCalledWith(
        'Approved the rates for 1 model.',
      ),
    );
    await waitFor(() => expect(fixture.getReport).toHaveBeenCalledTimes(2));
  });

  it('reports models that still need a price set by hand', async () => {
    fixture.fixPricing.mockResolvedValue({
      approved: [],
      changed: [],
      repaired: [],
      syncQueued: [],
      unresolved: [{ id: 'red', key: 'genfeed-ai/z-image-turbo', reason: 'x' }],
    });
    show();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Fix all pricing' }),
    );
    await fixture.openConfirm.mock.calls[0][0].onConfirm();

    await waitFor(() =>
      expect(fixture.notifyError).toHaveBeenCalledWith(
        '1 model needs a price set by hand.',
      ),
    );
  });
});

describe('fix pricing on a model row', () => {
  function showPage() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AdminModelsPageContent type="all" />
      </QueryClientProvider>,
    );
  }
  const model = (id: string) => ({ id, label: 'Model' }) as IModel;

  it('adds a fix action to the row actions that fixes just that model', async () => {
    showPage();
    await waitFor(() =>
      expect(listProps.current?.isModelPinned?.(model('red'))).toBe(true),
    );

    const [action] = listProps.current?.rowActions ?? [];
    expect(action?.isVisible?.(model('red'))).toBe(true);
    expect(action?.tooltip).toBeInstanceOf(Function);
    expect(
      typeof action?.tooltip === 'function' && action.tooltip(model('red')),
    ).toBe('Fix pricing: Model');
    action?.onClick?.(model('red'));

    await waitFor(() =>
      expect(fixture.fixPricing).toHaveBeenCalledWith(['red']),
    );
  });

  it('is absent and not pinned for a model whose pricing is fine', async () => {
    showPage();
    await waitFor(() => expect(fixture.getReport).toHaveBeenCalled());

    const [action] = listProps.current?.rowActions ?? [];
    expect(action?.isVisible?.(model('clean'))).toBe(false);
    expect(listProps.current?.isModelPinned?.(model('clean'))).toBe(false);
  });

  it('pins a model that only has a stale refresh to review', async () => {
    fixture.getReport.mockResolvedValue(
      report([
        row({
          attention: [
            { code: 'refresh_stale', level: 'orange', reason: 'stale' },
          ],
          attentionLevel: 'orange',
          id: 'stale',
        }),
      ]),
    );
    showPage();

    await waitFor(() =>
      expect(listProps.current?.isModelPinned?.(model('stale'))).toBe(true),
    );
  });
});

describe('pricing alert disclosure', () => {
  it('shows five models until expanded and can collapse again', async () => {
    fixture.getReport.mockResolvedValue(
      report(
        Array.from({ length: 8 }, (_, index) => ({
          ...red,
          id: `red-${index}`,
          key: `missing/model-${index}`,
        })),
      ),
    );
    show();
    const panel = await screen.findByTestId('model-pricing-attention-red');
    expect(panel.querySelectorAll('li')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more models' }));
    expect(panel.querySelectorAll('li')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(panel.querySelectorAll('li')).toHaveLength(5);
  });
});
