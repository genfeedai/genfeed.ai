import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectorsChannelsPage from './content';

const mocks = vi.hoisted(() => ({
  brand: null as { id: string } | null,
  brands: [] as Array<{ id: string; organizationSlug: string; slug: string }>,
  hasBrandId: true,
  isLoading: false,
  isReady: true,
  searchBrand: null as string | null,
  selectedBrand: null as { id: string; slug: string } | null,
  setPrimaryAction: vi.fn(),
  useBrandDetail: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (name: string) => (name === 'brand' ? mocks.searchBrand : null),
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brands: mocks.brands,
    isReady: mocks.isReady,
    selectedBrand: mocks.selectedBrand,
  }),
}));

vi.mock('@contexts/user/brand-context/brand-context.helpers', () => ({
  getBrandOrganizationSlug: (brand: { organizationSlug: string }) =>
    brand.organizationSlug,
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({ orgSlug: 'acme' }),
}));

vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: (options: unknown) => {
    mocks.useBrandDetail(options);
    return {
      brand: mocks.brand,
      brandId: mocks.brand?.id ?? '',
      connectedPlatformsCount: 0,
      handleRefreshBrand: vi.fn(),
      hasBrandId: mocks.hasBrandId,
      isLoading: mocks.isLoading,
    };
  },
}));

vi.mock('@ui/modals/brands/brand/ModalBrand.types', () => ({
  buildSocialConnections: () => [],
}));

vi.mock(
  '@/features/brands/components/sidebar/BrandDetailSocialMediaCard',
  () => ({
    default: () => <div data-testid="accounts-table" />,
  }),
);

vi.mock('../connectors-primary-action', () => ({
  useConnectorsPrimaryAction: (label: string) => mocks.setPrimaryAction(label),
}));

describe('ConnectorsChannelsPage', () => {
  beforeEach(() => {
    mocks.brand = null;
    mocks.brands = [];
    mocks.hasBrandId = true;
    mocks.isLoading = false;
    mocks.isReady = true;
    mocks.searchBrand = null;
    mocks.selectedBrand = null;
    mocks.setPrimaryAction.mockClear();
    mocks.useBrandDetail.mockClear();
  });

  it('shows the accounts of the brand selected in the top bar and offers Connect account', () => {
    mocks.brand = { id: 'brand-1' };
    mocks.selectedBrand = { id: 'brand-1', slug: 'coffee' };

    render(<ConnectorsChannelsPage />);

    expect(screen.getByTestId('accounts-table')).toBeInTheDocument();
    expect(mocks.useBrandDetail).toHaveBeenCalledWith({
      fallbackBrandSlug: 'coffee',
    });
    expect(mocks.setPrimaryAction).toHaveBeenCalledWith('Connect account');
  });

  it('shows the first brand of the organization when the route selects none', () => {
    mocks.brand = { id: 'brand-2' };
    mocks.brands = [
      { id: 'brand-9', organizationSlug: 'other', slug: 'elsewhere' },
      { id: 'brand-2', organizationSlug: 'acme', slug: 'tea' },
      { id: 'brand-3', organizationSlug: 'acme', slug: 'cake' },
    ];

    render(<ConnectorsChannelsPage />);

    expect(screen.getByTestId('accounts-table')).toBeInTheDocument();
    expect(mocks.useBrandDetail).toHaveBeenCalledWith({
      fallbackBrandSlug: 'tea',
    });
  });

  it('shows the brand named by ?brand= over the selected and first brands', () => {
    mocks.brand = { id: 'brand-3' };
    mocks.searchBrand = 'cake';
    mocks.selectedBrand = { id: 'brand-1', slug: 'coffee' };
    mocks.brands = [
      { id: 'brand-2', organizationSlug: 'acme', slug: 'tea' },
      { id: 'brand-3', organizationSlug: 'acme', slug: 'cake' },
      { id: 'brand-9', organizationSlug: 'other', slug: 'cake' },
    ];

    render(<ConnectorsChannelsPage />);

    expect(mocks.useBrandDetail).toHaveBeenCalledWith({
      fallbackBrandSlug: 'cake',
    });
  });

  it('ignores a ?brand= that is not a brand of the organization', () => {
    mocks.brand = { id: 'brand-2' };
    mocks.searchBrand = 'elsewhere';
    mocks.brands = [
      { id: 'brand-2', organizationSlug: 'acme', slug: 'tea' },
      { id: 'brand-9', organizationSlug: 'other', slug: 'elsewhere' },
    ];

    render(<ConnectorsChannelsPage />);

    expect(mocks.useBrandDetail).toHaveBeenCalledWith({
      fallbackBrandSlug: 'tea',
    });
  });

  it('says so when the organization has no brand', () => {
    mocks.brands = [
      { id: 'brand-9', organizationSlug: 'other', slug: 'elsewhere' },
    ];

    render(<ConnectorsChannelsPage />);

    expect(screen.queryByTestId('accounts-table')).not.toBeInTheDocument();
    expect(screen.getByText('Brand not found.')).toBeInTheDocument();
  });

  it('says so when no brand is selected', () => {
    render(<ConnectorsChannelsPage />);

    expect(screen.queryByTestId('accounts-table')).not.toBeInTheDocument();
    expect(screen.getByText('Brand not found.')).toBeInTheDocument();
  });

  it('says so when the selected brand cannot be loaded', () => {
    mocks.selectedBrand = { id: 'brand-1', slug: 'coffee' };
    mocks.brand = null;

    render(<ConnectorsChannelsPage />);

    expect(screen.queryByTestId('accounts-table')).not.toBeInTheDocument();
    expect(screen.getByText('Brand not found.')).toBeInTheDocument();
  });
});
