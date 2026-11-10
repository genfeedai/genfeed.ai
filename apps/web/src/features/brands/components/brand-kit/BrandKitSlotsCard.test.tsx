import { AssetCategory, BrandKitSlot } from '@genfeedai/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitSlotsCard from './BrandKitSlotsCard';

const { downloadKitLogo, fillPlatformImagesFromMaster } = vi.hoisted(() => ({
  downloadKitLogo: vi.fn(),
  fillPlatformImagesFromMaster: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    downloadKitLogo,
    fillPlatformImagesFromMaster,
  }),
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
  originalFormat?: string,
) => ({
  category,
  cdnUrl: `https://cdn.test/${id}`,
  id,
  kitSlot,
  originalFormat,
});

function brandWith(overrides: Partial<IBrand>): IBrand {
  return { id: 'brand-1', label: 'Brand', ...overrides } as IBrand;
}

describe('BrandKitSlotsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderLogos() {
    render(
      <BrandKitSlotsCard
        brand={brandWith({
          logos: [
            asset(
              'vector',
              AssetCategory.LOGO,
              BrandKitSlot.LOGO_PRIMARY,
              'svg',
            ),
            asset('raster', AssetCategory.LOGO, BrandKitSlot.LOGO_ICON, 'png'),
          ],
          slug: 'acme',
        } as Partial<IBrand>)}
        brandId="brand-1"
        isManager={false}
        onRefreshBrand={vi.fn()}
        onUpload={vi.fn()}
      />,
    );
  }

  it('offers the SVG download only for a logo uploaded as an SVG', () => {
    renderLogos();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'download slot.LOGO_PRIMARY' }),
    );
    expect(
      screen.getByRole('menuitem', { name: 'downloadVector' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'download slot.LOGO_ICON' }),
    );
    expect(
      screen.queryByRole('menuitem', { name: 'downloadVector' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual([
      'downloadSize {"format":"downloadPng","size":512}',
      'downloadSize {"format":"downloadPng","size":1024}',
      'downloadSize {"format":"downloadPng","size":2048}',
      'downloadSize {"format":"downloadPng","size":4096}',
      'downloadSize {"format":"downloadWebp","size":512}',
      'downloadSize {"format":"downloadWebp","size":1024}',
      'downloadSize {"format":"downloadWebp","size":2048}',
      'downloadSize {"format":"downloadWebp","size":4096}',
    ]);
  });

  it('saves the chosen format and size under the brand and slot name', async () => {
    const requests: unknown[][] = [];
    const saved: string[] = [];
    downloadKitLogo.mockImplementation(async (...args: unknown[]) => {
      requests.push(args);
      return new Blob(['png']);
    });
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = () => 'blob:logo';
    URL.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
    renderLogos();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'download slot.LOGO_ICON' }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'downloadSize {"format":"downloadPng","size":2048}',
      }),
    );

    await vi.waitFor(() => expect(saved).toEqual(['acme-logo-icon.png']));
    expect(requests).toEqual([
      ['brand-1', BrandKitSlot.LOGO_ICON, 'png', 2048],
    ]);
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    vi.restoreAllMocks();
  });

  it('says so when a logo download fails', async () => {
    downloadKitLogo.mockRejectedValueOnce(new Error('down'));
    renderLogos();

    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'download slot.LOGO_PRIMARY' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'downloadVector' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'downloadFailed',
    );
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

  it('locks every fill control while a fill is running', async () => {
    fillPlatformImagesFromMaster.mockReturnValue(new Promise(() => {}));
    render(
      <BrandKitSlotsCard
        brand={brandWith({
          banners: [
            asset('master', AssetCategory.BANNER, BrandKitSlot.BANNER_MASTER),
          ],
        } as Partial<IBrand>)}
        brandId="brand-1"
        isManager
        onRefreshBrand={vi.fn()}
        onUpload={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'fillFromMaster slot.YOUTUBE_BANNER',
      }),
    );

    expect(
      await screen.findByRole('button', {
        name: 'fillFromMaster slot.X_HEADER',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'fillEmptyFromMaster' }),
    ).toBeDisabled();
  });

  it('shows a replacement image after the previous preview failed', () => {
    const props = {
      brandId: 'brand-1',
      isManager: true,
      onRefreshBrand: vi.fn(),
      onUpload: vi.fn(),
    };
    const { rerender } = render(
      <BrandKitSlotsCard
        brand={brandWith({
          logos: [asset('broken', AssetCategory.LOGO, null)],
        } as Partial<IBrand>)}
        {...props}
      />,
    );
    const primary = screen.getByRole('figure', { name: 'slot.LOGO_PRIMARY' });
    fireEvent.error(within(primary).getByRole('img'));
    expect(within(primary).queryByRole('img')).not.toBeInTheDocument();

    rerender(
      <BrandKitSlotsCard
        brand={brandWith({
          logos: [asset('fresh', AssetCategory.LOGO, null)],
        } as Partial<IBrand>)}
        {...props}
      />,
    );

    expect(within(primary).getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.test/fresh',
    );
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
