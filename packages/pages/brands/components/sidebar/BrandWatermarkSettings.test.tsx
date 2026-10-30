import BrandWatermarkSettings from '@pages/brands/components/sidebar/BrandWatermarkSettings';
import type { BrandWatermarkSettingsProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateWatermark } = vi.hoisted(() => ({ updateWatermark: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ updateWatermark }),
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
    updateWatermark.mockResolvedValue({});
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
      expect(updateWatermark).toHaveBeenCalledWith('brand-1', {
        watermarkText: 'Client preview',
        watermarkLogoId: null,
        watermarkOpacity: 0.5,
        watermarkPosition: 'bottom-right',
        watermarkSizeRatio: null,
        watermarkInsetXRatio: null,
        watermarkInsetYRatio: null,
        watermarkLightLogoId: null,
        watermarkLiveLogoId: null,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('saved');
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('saves size and distances as ratios of the width and shows saved ones as percents', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <BrandWatermarkSettings
        brand={{
          ...brand,
          watermarkInsetXRatio: 0.096,
          watermarkSizeRatio: 0.0667,
        }}
        brandId="brand-1"
        onRefreshBrand={refresh}
      />,
    );
    expect(screen.getByLabelText('size')).toHaveValue(6.67);
    expect(screen.getByLabelText('insetX')).toHaveValue(9.6);
    expect(screen.getByLabelText('insetY')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('insetY'), {
      target: { value: '23.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(updateWatermark).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          watermarkInsetXRatio: 0.096,
          watermarkInsetYRatio: 0.235,
          watermarkSizeRatio: 0.0667,
        }),
      ),
    );
  });

  it('blocks saving a size or distance outside the allowed range', () => {
    render(
      <BrandWatermarkSettings
        brand={brand}
        brandId="brand-1"
        onRefreshBrand={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('size'), {
      target: { value: '80' },
    });
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('size'), {
      target: { value: '' },
    });
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();
  });

  it('keeps a mark for light footage and one for livestreams', async () => {
    render(
      <BrandWatermarkSettings
        brand={{
          ...brand,
          watermarkLightLogoId: 'logo-light',
          watermarkLiveLogoId: 'logo-live',
        }}
        brandId="brand-1"
        onRefreshBrand={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() =>
      expect(updateWatermark).toHaveBeenCalledWith(
        'brand-1',
        expect.objectContaining({
          watermarkLightLogoId: 'logo-light',
          watermarkLiveLogoId: 'logo-live',
        }),
      ),
    );
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
    expect(updateWatermark).not.toHaveBeenCalled();
  });
  it('keeps settings editable after a failed save', async () => {
    updateWatermark.mockRejectedValue(new Error('offline'));
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
