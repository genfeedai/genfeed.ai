import { AssetCategory, BrandKitSlot } from '@genfeedai/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitSlotsCard from './BrandKitSlotsCard';

const { fillPlatformImagesFromMaster } = vi.hoisted(() => ({
  fillPlatformImagesFromMaster: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ fillPlatformImagesFromMaster }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: { cdnUrl: 'https://cdn.test' },
}));

const asset = (
  id: string,
  category: AssetCategory,
  kitSlot: BrandKitSlot | null,
) => ({ category, cdnUrl: `https://cdn.test/${id}`, id, kitSlot });

function brandWith(overrides: Partial<IBrand>): IBrand {
  return { id: 'brand-1', label: 'Brand', ...overrides } as IBrand;
}

describe('BrandKitSlotsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a slotless logo as the primary variant', () => {
    render(
      <BrandKitSlotsCard
        brand={brandWith({
          logos: [asset('legacy', AssetCategory.LOGO, null)],
        } as Partial<IBrand>)}
        brandId="brand-1"
        isManager
        onRefreshBrand={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    const primary = screen.getByRole('figure', { name: 'slot.LOGO_PRIMARY' });
    expect(within(primary).getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.test/legacy',
    );
    expect(within(primary).getByText('default')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'upload slot.LOGO_ICON' }),
    ).toBeInTheDocument();
  });

  it('uploads into the slot the owner picked', () => {
    const onUpload = vi.fn();
    render(
      <BrandKitSlotsCard
        brand={brandWith({})}
        brandId="brand-1"
        isManager
        onRefreshBrand={vi.fn()}
        onUpload={onUpload}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'upload slot.YOUTUBE_BANNER' }),
    );

    expect(onUpload).toHaveBeenCalledWith(BrandKitSlot.YOUTUBE_BANNER);
  });

  it('fills only the empty platform slots from the master banner', async () => {
    fillPlatformImagesFromMaster.mockResolvedValue([
      { slot: BrandKitSlot.X_PROFILE, status: 'filled' },
      { slot: BrandKitSlot.YOUTUBE_BANNER, status: 'failed' },
    ]);
    const onRefreshBrand = vi.fn().mockResolvedValue(undefined);
    render(
      <BrandKitSlotsCard
        brand={brandWith({
          banners: [
            asset('master', AssetCategory.BANNER, BrandKitSlot.BANNER_MASTER),
            asset('x', AssetCategory.BANNER, BrandKitSlot.X_HEADER),
          ],
        } as Partial<IBrand>)}
        brandId="brand-1"
        isManager
        onRefreshBrand={onRefreshBrand}
        onUpload={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'fillEmptyFromMaster' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'filled {"count":1} · fillFailed {"slots":"slot.YOUTUBE_BANNER"}',
    );
    expect(fillPlatformImagesFromMaster).toHaveBeenCalledWith('brand-1', [
      BrandKitSlot.X_PROFILE,
      BrandKitSlot.YOUTUBE_BANNER,
      BrandKitSlot.YOUTUBE_PROFILE,
      BrandKitSlot.LINKEDIN_COVER,
      BrandKitSlot.LINKEDIN_LOGO,
      BrandKitSlot.FACEBOOK_COVER,
      BrandKitSlot.FACEBOOK_PROFILE,
    ]);
  });

  it('asks for a master banner before offering to fill from it', () => {
    render(
      <BrandKitSlotsCard
        brand={brandWith({})}
        brandId="brand-1"
        isManager
        onRefreshBrand={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByText('noMaster')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'fillEmptyFromMaster' }),
    ).not.toBeInTheDocument();
  });

  it('shows the kit without upload controls to a member who cannot manage it', () => {
    render(
      <BrandKitSlotsCard
        brand={brandWith({})}
        brandId="brand-1"
        isManager={false}
        onRefreshBrand={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    expect(screen.getByText('logosTitle')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
