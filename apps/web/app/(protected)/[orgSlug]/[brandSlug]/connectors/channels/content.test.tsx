import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectorsChannelsPage from './content';

const mocks = vi.hoisted(() => ({
  brand: null as { id: string } | null,
  hasBrandId: true,
  isLoading: false,
  setPrimaryAction: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

vi.mock('@/hooks/pages/use-brand-detail/use-brand-detail', () => ({
  useBrandDetail: () => ({
    brand: mocks.brand,
    brandId: mocks.brand?.id ?? '',
    connectedPlatformsCount: 0,
    handleRefreshBrand: vi.fn(),
    hasBrandId: mocks.hasBrandId,
    isLoading: mocks.isLoading,
  }),
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

vi.mock('../../../~/connectors/connectors-primary-action', () => ({
  useConnectorsPrimaryAction: (label: string) => mocks.setPrimaryAction(label),
}));

describe('ConnectorsChannelsPage', () => {
  beforeEach(() => {
    mocks.brand = null;
    mocks.hasBrandId = true;
    mocks.isLoading = false;
    mocks.setPrimaryAction.mockClear();
  });

  it('shows the accounts of the brand in the URL and offers Connect account', () => {
    mocks.brand = { id: 'brand-1' };

    render(<ConnectorsChannelsPage />);

    expect(screen.getByTestId('accounts-table')).toBeInTheDocument();
    expect(mocks.setPrimaryAction).toHaveBeenCalledWith('Connect account');
  });

  it('keeps the accounts on screen while the brand refetches', () => {
    mocks.brand = { id: 'brand-1' };
    mocks.isLoading = true;

    render(<ConnectorsChannelsPage />);

    expect(screen.getByTestId('accounts-table')).toBeInTheDocument();
  });

  it('says so when the brand in the URL cannot be loaded', () => {
    render(<ConnectorsChannelsPage />);

    expect(screen.queryByTestId('accounts-table')).not.toBeInTheDocument();
    expect(screen.getByText('Brand not found.')).toBeInTheDocument();
  });
});
