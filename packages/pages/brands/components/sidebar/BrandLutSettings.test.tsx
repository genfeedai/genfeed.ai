import BrandLutSettings from '@pages/brands/components/sidebar/BrandLutSettings';
import type { BrandLutSettingsProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { removeLut, updateLut, uploadLut } = vi.hoisted(() => ({
  removeLut: vi.fn(),
  updateLut: vi.fn(),
  uploadLut: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ removeLut, updateLut, uploadLut }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));

const emptyBrand = { id: 'brand-1' } as BrandLutSettingsProps['brand'];
const gradedBrand = {
  id: 'brand-1',
  isLutEnabled: false,
  lutFileName: 'brand-look.cube',
} as BrandLutSettingsProps['brand'];

function cubeFile(name: string, contents = 'LUT_3D_SIZE 2\n'): File {
  return new File([contents], name, { type: 'application/octet-stream' });
}

function renderSettings(
  brand: BrandLutSettingsProps['brand'],
  onRefreshBrand = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <BrandLutSettings
      brand={brand}
      brandId="brand-1"
      onRefreshBrand={onRefreshBrand}
    />,
  );
  return onRefreshBrand;
}

describe('BrandLutSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeLut.mockResolvedValue({});
    updateLut.mockResolvedValue({});
    uploadLut.mockResolvedValue({});
  });

  it('uploads the chosen .cube file and refreshes the brand', async () => {
    const refresh = renderSettings(emptyBrand);
    const file = cubeFile('brand-look.cube');

    fireEvent.change(screen.getByLabelText('upload'), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(uploadLut).toHaveBeenCalledWith('brand-1', file),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('uploaded');
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([
    ['a file that is not a .cube', cubeFile('look.png')],
    ['an empty file', cubeFile('look.cube', '')],
  ])('turns away %s before sending it', async (_label, file) => {
    renderSettings(emptyBrand);

    fireEvent.change(screen.getByLabelText('upload'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('invalidFile');
    expect(uploadLut).not.toHaveBeenCalled();
  });

  it('keeps the switch off until a LUT exists', () => {
    renderSettings(emptyBrand);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByTestId('brand-lut-file-name')).toHaveTextContent(
      'noFile',
    );
  });

  it('turns the grade on and shows the stored file name', async () => {
    const refresh = renderSettings(gradedBrand);
    expect(screen.getByTestId('brand-lut-file-name')).toHaveTextContent(
      'brand-look.cube',
    );

    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() =>
      expect(updateLut).toHaveBeenCalledWith('brand-1', { isLutEnabled: true }),
    );
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('removes the LUT', async () => {
    renderSettings(gradedBrand);
    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    await waitFor(() => expect(removeLut).toHaveBeenCalledWith('brand-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('removed');
  });

  it('reports a failed upload and stays usable', async () => {
    uploadLut.mockRejectedValue(new Error('offline'));
    renderSettings(emptyBrand);

    fireEvent.change(screen.getByLabelText('upload'), {
      target: { files: [cubeFile('brand-look.cube')] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('error');
    expect(screen.getByLabelText('upload')).not.toBeDisabled();
  });
});
