import { BrandKitSlot } from '@genfeedai/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitTransferCard from './BrandKitTransferCard';

const { importKit, exportKit } = vi.hoisted(() => ({
  exportKit: vi.fn(),
  importKit: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ exportKit, importKit }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

function choose(name: string, size = 2048) {
  fireEvent.change(screen.getByLabelText('import'), {
    target: { files: [new File([new Uint8Array(size)], name)] },
  });
}

describe('BrandKitTransferCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a file that is not a ZIP', () => {
    render(
      <BrandKitTransferCard
        brandId="brand-1"
        downloadName="acme-brand-kit.zip"
        onImported={vi.fn()}
      />,
    );

    choose('kit.pdf');

    expect(screen.getByRole('alert')).toHaveTextContent('notZip');
  });

  it('reports what the import added and what it left out', async () => {
    importKit.mockResolvedValue({
      banners: [BrandKitSlot.X_HEADER],
      fontCount: 1,
      hasColors: true,
      hasFontRoles: true,
      hasPalette: true,
      logos: [BrandKitSlot.LOGO_PRIMARY, BrandKitSlot.LOGO_ICON],
      skipped: [{ file: 'logos/logo_dark.png', reason: 'unsupported_image' }],
    });
    const onImported = vi.fn();
    render(
      <BrandKitTransferCard
        brandId="brand-1"
        downloadName="acme-brand-kit.zip"
        onImported={onImported}
      />,
    );

    choose('acme-brand-kit.zip');

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('imported 1 1 2');
    expect(status).toHaveTextContent(
      'skipped logos/logo_dark.png skipReason.unsupported_image',
    );
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('says so when the import fails', async () => {
    importKit.mockRejectedValue(new Error('brand_kit_manifest_invalid'));
    render(
      <BrandKitTransferCard
        brandId="brand-1"
        downloadName="acme-brand-kit.zip"
        onImported={vi.fn()}
      />,
    );

    choose('other.zip');

    expect(await screen.findByRole('alert')).toHaveTextContent('importFailed');
  });

  it('says so when the download fails', async () => {
    exportKit.mockRejectedValue(new Error('network'));
    render(
      <BrandKitTransferCard
        brandId="brand-1"
        downloadName="acme-brand-kit.zip"
        onImported={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'download' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'downloadFailed',
    );
  });
});
