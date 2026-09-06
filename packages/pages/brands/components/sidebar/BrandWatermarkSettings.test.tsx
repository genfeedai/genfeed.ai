import BrandWatermarkSettings from '@pages/brands/components/sidebar/BrandWatermarkSettings';
import type { BrandWatermarkSettingsProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ patch }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

const brand = {
  id: 'brand-1',
  watermarkText: 'Preview',
  watermarkOpacity: 0.35,
  watermarkPosition: 'bottom-right',
} as BrandWatermarkSettingsProps['brand'];

describe('BrandWatermarkSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patch.mockResolvedValue({});
  });
  it('persists percentages as opacity and empty logo as null', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <BrandWatermarkSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText('opacity'), {
      target: { value: '50' },
    });
    fireEvent.change(screen.getByLabelText('text'), {
      target: { value: ' Client preview ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('brand-1', {
        watermarkText: 'Client preview',
        watermarkLogoId: null,
        watermarkOpacity: 0.5,
        watermarkPosition: 'bottom-right',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('prevents invalid opacity values from being saved', () => {
    render(
      <BrandWatermarkSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('opacity'), {
      target: { value: '0' },
    });
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    expect(patch).not.toHaveBeenCalled();
  });
  it('keeps settings editable after a failed save', async () => {
    patch.mockRejectedValue(new Error('offline'));
    render(
      <BrandWatermarkSettings
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
