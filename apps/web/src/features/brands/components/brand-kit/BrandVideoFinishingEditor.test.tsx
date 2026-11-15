import type { BrandVideoFinishingV1 } from '@genfeedai/contracts/api-types/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandVideoFinishingEditor from './BrandVideoFinishingEditor';

const mocks = vi.hoisted(() => ({
  removeLut: vi.fn(),
  uploadLut: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const t = translateFromCatalog('pages.brandVideoKit');
  return { useTranslations: () => t };
});
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    removeLut: mocks.removeLut,
    uploadLut: mocks.uploadLut,
  }),
}));

const FINISHING: BrandVideoFinishingV1 = {
  endCard: { durationSeconds: 3, isEnabled: false },
  lut: { isEnabled: false },
  watermark: { opacity: 0.35, position: 'top-right', sizeRatio: 0.0667 },
};

function renderEditor(brand: Partial<IBrand> = {}, isDisabled = false) {
  const onChange = vi.fn();
  const onRefreshBrand = vi.fn().mockResolvedValue(undefined);
  render(
    <BrandVideoFinishingEditor
      brand={{ id: 'brand-1', label: 'Acme', ...brand } as IBrand}
      brandId="brand-1"
      finishing={FINISHING}
      isDisabled={isDisabled}
      onChange={onChange}
      onRefreshBrand={onRefreshBrand}
    />,
  );
  return { onChange, onRefreshBrand };
}

describe('BrandVideoFinishingEditor', () => {
  beforeEach(() => {
    mocks.removeLut.mockReset().mockResolvedValue(undefined);
    mocks.uploadLut.mockReset().mockResolvedValue(undefined);
  });

  it('shows the saved watermark size as a percent of the width', () => {
    renderEditor();
    expect(screen.getByLabelText('Size (% of width)')).toHaveValue(6.67);
  });

  it('changes the end card in the draft, not on the brand', () => {
    const { onChange } = renderEditor();

    fireEvent.click(screen.getByRole('switch', { name: 'End card' }));

    expect(onChange).toHaveBeenCalledWith({
      ...FINISHING,
      endCard: { durationSeconds: 3, isEnabled: true },
    });
  });

  it('saves a watermark inset as a ratio of the width', () => {
    const { onChange } = renderEditor();

    fireEvent.change(
      screen.getByLabelText('From top or bottom edge (% of width)'),
      {
        target: { value: '23.5' },
      },
    );

    expect(onChange).toHaveBeenCalledWith({
      ...FINISHING,
      watermark: { ...FINISHING.watermark, insetYRatio: 0.235 },
    });
  });

  it('keeps the colour grade switch off until a LUT file exists', () => {
    renderEditor();
    expect(
      screen.getByRole('switch', { name: 'Colour grade (LUT)' }),
    ).toBeDisabled();
  });

  it('never sends a file that is not a .cube', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Upload .cube file'), {
      target: {
        files: [new File(['not a lut'], 'look.png', { type: 'image/png' })],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a .cube file',
    );
    expect(mocks.uploadLut).not.toHaveBeenCalled();
  });

  it('removes the LUT on the brand and switches the grade off in the draft', async () => {
    const { onChange, onRefreshBrand } = renderEditor({
      isLutEnabled: true,
      lutFileName: 'warm.cube',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Remove LUT' }));

    await waitFor(() =>
      expect(mocks.removeLut).toHaveBeenCalledWith('brand-1'),
    );
    await waitFor(() => expect(onRefreshBrand).toHaveBeenCalled());
    expect(onChange).toHaveBeenCalledWith({
      ...FINISHING,
      lut: { isEnabled: false },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('LUT removed.');
  });
});
