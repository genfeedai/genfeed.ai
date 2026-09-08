import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CostUsagePage from '@/features/settings/cost-usage/CostUsagePage';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

const { mockExportUsageCsv, mockGetEntriesPage, mockUseQuery } = vi.hoisted(
  () => ({
    mockExportUsageCsv: vi.fn(),
    mockGetEntriesPage: vi.fn(),
    mockUseQuery: vi.fn(),
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Demo', slug: 'demo' }],
    isReady: true,
    organizationId: 'organization-1',
    selectedBrand: { id: 'brand-1', label: 'Demo', slug: 'demo' },
  }),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    exportUsageCsv: mockExportUsageCsv,
    getEntriesPage: mockGetEntriesPage,
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
    mockExportUsageCsv.mockResolvedValue(new ArrayBuffer(4));
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
        data:
          options.queryKey[0] === 'settings-workflow-costs'
            ? []
            : {
                total: 53,
                limit: 25,
                skip: 0,
                docs: [
                  {
                    brandId: 'brand-1',
                    brandLabel: 'Demo',
                    category: 'image',
                    createdAt: '2026-08-20T10:00:00.000Z',
                    creditsUsed: 0,
                    entryType: 'media',
                    id: 'media-1',
                    isByok: false,
                    model: 'black-forest-labs/flux-schnell',
                    provider: 'replicate',
                    providerCostMicros: 125_000,
                    providerCostUsd: 0.125,
                    referenceId: 'ingredient-1',
                  },
                ],
              },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it('shows credit usage and charts without vendor accounting', () => {
    render(<CostUsagePage />);
    expect(screen.getByRole('heading', { name: 'Usage' })).toBeInTheDocument();
    expect(screen.getAllByText('18.5 GEN').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('heading', { name: 'Daily credit burn (GEN)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Daily generations' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/provider|\$2.75|BYOK/i)).not.toBeInTheDocument();
    expect(screen.queryByText('flux-schnell')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Brand')).toBeInTheDocument();
  });

  it('paginates the ledger and resets the page when the brand changes', async () => {
    const { rerender } = render(<CostUsagePage lockedBrandId="brand-1" />);
    fireEvent.mouseDown(
      screen.getByRole('tab', { name: 'Generations', exact: true }),
      { button: 0, ctrlKey: false },
    );
    expect(screen.getByText('flux-schnell')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(
      screen.queryByText(/replicate|black-forest-labs|\$0.125/i),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: /next page/i }));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          'settings-cost-entries',
          'organization-1',
          expect.any(Object),
          2,
        ],
      }),
    );
    const pageQuery = mockUseQuery.mock.calls.findLast(
      ([options]) => options.queryKey[0] === 'settings-cost-entries',
    )?.[0];
    await pageQuery.queryFn();
    expect(mockGetEntriesPage).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', limit: 25, skip: 25 }),
    );
    mockUseQuery.mockClear();
    rerender(<CostUsagePage lockedBrandId="brand-2" />);
    await waitFor(() =>
      expect(mockUseQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: [
            'settings-cost-entries',
            'organization-1',
            expect.objectContaining({ brandId: 'brand-2' }),
            1,
          ],
        }),
      ),
    );
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
    expect(screen.queryByText('Provider cost')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Export credits/i }));

    await waitFor(() => {
      expect(mockExportUsageCsv).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: 'brand-1' }),
      );
    });
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:cost-export');
  });
});
