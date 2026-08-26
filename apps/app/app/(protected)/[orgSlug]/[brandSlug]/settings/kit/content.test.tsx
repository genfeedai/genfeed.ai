import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BrandSettingsKitPage from './content';

const mocks = vi.hoisted(() => ({
  captureBrandOsFunnelStage: vi.fn(),
  handleOpenUploadModal: vi.fn(),
  handleRefreshBrand: vi.fn(),
  handleRequestDeleteReference: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/lib/analytics', () => ({
  captureBrandOsFunnelStage: mocks.captureBrandOsFunnelStage,
}));

vi.mock('@hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: { id: 'brand-1', label: 'Acme' },
    brandId: 'brand-1',
    deletingRefId: null,
    handleOpenUploadModal: mocks.handleOpenUploadModal,
    handleRefreshBrand: mocks.handleRefreshBrand,
    handleRequestDeleteReference: mocks.handleRequestDeleteReference,
    hasBrandId: true,
    isLoading: false,
  }),
}));

vi.mock('@pages/brands/components/brand-kit/BrandKitReviewCard', () => ({
  default: (props: {
    loadClaimedBrandOsDraft?: boolean;
    onBrandOsDraftAccepted?: () => void;
    onBrandOsDraftLoaded?: () => void;
  }) => (
    <section
      data-load-claimed={String(props.loadClaimedBrandOsDraft)}
      data-testid="review-card"
    >
      Brand Kit Review
      <button type="button" onClick={props.onBrandOsDraftLoaded}>
        loaded
      </button>
      <button type="button" onClick={props.onBrandOsDraftAccepted}>
        accepted
      </button>
    </section>
  ),
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailManualKitCard', () => ({
  default: () => <section data-testid="manual-card">Manual Brand Kit</section>,
}));

vi.mock('@pages/brands/components/sidebar/BrandDetailReferencesCard', () => ({
  default: () => <section data-testid="references-card">References</section>,
}));

vi.mock('@ui/cards/brand-completeness-card/BrandCompletenessCard', () => ({
  default: () => (
    <section data-testid="completeness-card">Completeness</section>
  ),
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

vi.mock('@ui/loading/default/Loading', () => ({
  default: () => <div role="status">Loading</div>,
}));

describe('BrandSettingsKitPage', () => {
  it('keeps authenticated Brand Kit review on the compact product scale', () => {
    render(<BrandSettingsKitPage />);

    const surface = screen.getByRole('region', { name: 'Brand Kit settings' });

    expect(surface).toHaveAttribute('data-scale-role', 'product');
    expect(surface).toHaveAttribute('data-control-baseline', '32px');
    expect(
      screen.getByRole('heading', { name: 'Review brand evidence' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Candidate colors stay separate from Genfeed product tokens/i,
      ),
    ).toBeInTheDocument();
  });

  it('puts evidence review before manual changes and reference management', () => {
    render(<BrandSettingsKitPage />);

    const review = screen.getByTestId('review-card');
    const manual = screen.getByTestId('manual-card');
    const references = screen.getByTestId('references-card');

    expect(
      review.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      manual.compareDocumentPosition(references) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('loads the tenant-bound handoff and emits sanitized deduped milestones', () => {
    render(<BrandSettingsKitPage />);

    expect(screen.getByTestId('review-card')).toHaveAttribute(
      'data-load-claimed',
      'true',
    );
    screen.getByRole('button', { name: 'loaded' }).click();
    screen.getByRole('button', { name: 'accepted' }).click();
    expect(mocks.captureBrandOsFunnelStage).toHaveBeenNthCalledWith(
      1,
      'draft_saved',
    );
    expect(mocks.captureBrandOsFunnelStage).toHaveBeenNthCalledWith(
      2,
      'draft_accepted',
    );
  });
});
