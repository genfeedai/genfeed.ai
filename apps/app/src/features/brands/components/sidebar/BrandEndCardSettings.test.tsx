import type { BrandEndCardSettingsProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandEndCardSettings from '@/features/brands/components/sidebar/BrandEndCardSettings';

const { updateEndCard } = vi.hoisted(() => ({ updateEndCard: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ updateEndCard }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

const brand = {
  id: 'brand-1',
  endCardAssetId: 'asset-1',
  endCardDurationSeconds: 3,
  isEndCardEnabled: true,
  logo: { id: 'asset-1' },
} as BrandEndCardSettingsProps['brand'];

describe('BrandEndCardSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateEndCard.mockResolvedValue({});
  });

  it('saves the chosen image, duration and switch together', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <BrandEndCardSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText('duration'), {
      target: { value: '4.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(updateEndCard).toHaveBeenCalledWith('brand-1', {
        endCardAssetId: 'asset-1',
        endCardDurationSeconds: 4.5,
        isEndCardEnabled: true,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('blocks a duration outside the supported range', () => {
    render(
      <BrandEndCardSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('duration'), {
      target: { value: '30' },
    });
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    expect(updateEndCard).not.toHaveBeenCalled();
  });

  it('blocks turning the end card on without an image', () => {
    render(
      <BrandEndCardSettings
        brand={{ ...brand, endCardAssetId: null, isEndCardEnabled: true }}
        brandId="brand-1"
        onRefreshBrand={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
  });

  it('keeps settings editable after a failed save', async () => {
    updateEndCard.mockRejectedValue(new Error('offline'));
    render(
      <BrandEndCardSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('error');
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
  });
});
