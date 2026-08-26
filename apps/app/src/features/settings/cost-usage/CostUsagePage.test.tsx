import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CostUsagePage from '@/features/settings/cost-usage/CostUsagePage';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { mockExportCsv, mockUseQuery } = vi.hoisted(() => ({
  mockExportCsv: vi.fn(),
  mockUseQuery: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Demo', slug: 'demo' }],
    isReady: true,
    selectedBrand: { id: 'brand-1', label: 'Demo', slug: 'demo' },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    exportCsv: mockExportCsv,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: unknown[] }) => mockUseQuery(options),
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({ error: vi.fn(), success: vi.fn() }),
  },
}));

describe('CostUsagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportCsv.mockResolvedValue(new ArrayBuffer(4));
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) => {
      if (String(options.queryKey[0]).includes('summary')) {
        return {
          data: {
            byBrand: [
              {
                brandId: 'brand-1',
                brandLabel: 'Demo',
                byokCount: 1,
                creditsUsed: 18.5,
                generationCount: 3,
                llmCount: 2,
                mediaCount: 1,
                providerCostMicros: 2_750_000,
                providerCostUsd: 2.75,
              },
            ],
            daily: [],
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-08-26T23:59:59.999Z',
            total: {
              byokCount: 1,
              creditsUsed: 18.5,
              generationCount: 3,
              llmCount: 2,
              mediaCount: 1,
              providerCostMicros: 2_750_000,
              providerCostUsd: 2.75,
            },
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
            brandId: 'brand-1',
            brandLabel: 'Demo',
            category: 'image',
            createdAt: '2026-08-20T10:00:00.000Z',
            creditsUsed: 0,
            entryType: 'media',
            id: 'media-1',
            isByok: false,
            model: 'flux-schnell',
            provider: 'replicate',
            providerCostMicros: 125_000,
            providerCostUsd: 0.125,
            referenceId: 'ingredient-1',
          },
        ],
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it('shows organization cost, credits, per-brand split, and ledger', () => {
    render(<CostUsagePage />);

    expect(
      screen.getByRole('heading', { name: 'Cost & Usage' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Provider cost').length).toBeGreaterThan(0);
    expect(screen.getByText('$2.75')).toBeInTheDocument();
    expect(screen.getAllByText('Credits used').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: 'Cost split by brand' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Generation ledger' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Brand')).toBeInTheDocument();
  });

  it('locks brand settings to the route brand and downloads the scoped CSV', async () => {
    const createObjectUrl = vi.fn(() => 'blob:cost-export');
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });

    render(<CostUsagePage lockedBrandId="brand-1" />);

    expect(screen.queryByLabelText('Brand')).not.toBeInTheDocument();
    expect(screen.getByText('Demo brand costs')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(mockExportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand-1' }),
      );
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cost-export');
  });
});
