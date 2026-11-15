import type { BrandVideoFinishingV1 } from '@genfeedai/contracts/api-types/contracts';
import type { IBrand } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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

function Harness({
  brand,
  isDisabled,
}: {
  brand: Partial<IBrand>;
  isDisabled: boolean;
}) {
  const [finishing, setFinishing] = useState(FINISHING);
  return (
    <BrandVideoFinishingEditor
      brand={{ id: 'brand-1', label: 'Acme', ...brand } as IBrand}
      brandId="brand-1"
      finishing={finishing}
      isDisabled={isDisabled}
      onChange={setFinishing}
      onRefreshBrand={async () => undefined}
    />
  );
}

function renderEditor(brand: Partial<IBrand> = {}, isDisabled = false) {
  render(<Harness brand={brand} isDisabled={isDisabled} />);
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

  it('shows the end card settings once the end card is switched on', () => {
    renderEditor();
    expect(screen.queryByText('End card image')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'End card' }));

    expect(screen.getByRole('switch', { name: 'End card' })).toBeChecked();
    expect(screen.getByText('End card image')).toBeInTheDocument();
  });

  it('shows a watermark inset edited as a percent of the width', () => {
    renderEditor();

    fireEvent.change(
      screen.getByLabelText('From top or bottom edge (% of width)'),
      { target: { value: '23.5' } },
    );

    expect(
      screen.getByLabelText('From top or bottom edge (% of width)'),
    ).toHaveValue(23.5);
  });

  it('keeps the colour grade switch off until a LUT file exists', () => {
    renderEditor();
    expect(
      screen.getByRole('switch', { name: 'Colour grade (LUT)' }),
    ).toBeDisabled();
  });

  it('refuses a file that is not a .cube', async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText('Upload .cube file'), {
      target: {
        files: [new File(['not a lut'], 'look.png', { type: 'image/png' })],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a .cube file',
    );
    expect(screen.getByText('No LUT uploaded yet.')).toBeInTheDocument();
  });

  it('switches the colour grade off after the LUT is removed', async () => {
    renderEditor({ isLutEnabled: true, lutFileName: 'warm.cube' });
    expect(screen.getByText('warm.cube')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove LUT' }));

    expect(await screen.findByRole('status')).toHaveTextContent('LUT removed.');
    expect(
      screen.getByRole('switch', { name: 'Colour grade (LUT)' }),
    ).not.toBeChecked();
  });
});
