import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandPaletteEditor from './BrandPaletteEditor';

const { getLogoColorCandidates, copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  getLogoColorCandidates: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key} ${Object.values(values).join(' ')}` : key,
}));
vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({ getLogoColorCandidates }),
}));
vi.mock('@services/social/brands.service', () => ({
  BrandsService: { getInstance: vi.fn() },
}));
vi.mock('@genfeedai/services/core/clipboard.service', () => ({
  ClipboardService: { getInstance: () => ({ copyToClipboard }) },
}));

const palette = [
  { hex: '#FF6600', name: 'Accent', usage: 'Buttons' },
  { hex: '#111111', name: 'Text' },
];

describe('BrandPaletteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows each named color with its hex value and usage', () => {
    render(
      <BrandPaletteEditor
        brandId="brand-1"
        label="Color palette"
        value={palette}
        isDisabled={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('colorName 1')).toHaveValue('Accent');
    expect(screen.getByText('#FF6600')).toBeInTheDocument();
    expect(screen.getByLabelText('colorUsage Accent')).toHaveValue('Buttons');
    expect(screen.getByLabelText('colorName 2')).toHaveValue('Text');
  });

  it('copies a hex value', () => {
    render(
      <BrandPaletteEditor
        brandId="brand-1"
        label="Color palette"
        value={palette}
        isDisabled={false}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'copyHex #111111' }));

    expect(copyToClipboard).toHaveBeenCalledWith('#111111');
  });

  it('renames a color and keeps the rest of the palette', () => {
    const onChange = vi.fn();
    render(
      <BrandPaletteEditor
        brandId="brand-1"
        label="Color palette"
        value={palette}
        isDisabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('colorName 2'), {
      target: { value: 'Body text' },
    });

    expect(onChange).toHaveBeenCalledWith([
      palette[0],
      { hex: '#111111', name: 'Body text' },
    ]);
  });

  it('suggests colors from the logo and adds the one picked', async () => {
    getLogoColorCandidates.mockResolvedValue([
      { hex: '#FF6600', share: 0.6 },
      { hex: '#1E2A5A', share: 0.3 },
    ]);
    const onChange = vi.fn();
    render(
      <BrandPaletteEditor
        brandId="brand-1"
        label="Color palette"
        value={palette}
        isDisabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'fromLogo' }));

    expect(
      await screen.findByRole('button', { name: 'addCandidate #FF6600' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'addCandidate #1E2A5A' }),
    );
    expect(onChange).toHaveBeenCalledWith([
      ...palette,
      { hex: '#1E2A5A', name: 'newColorName 3' },
    ]);
  });

  it('says when the logo cannot be read', async () => {
    getLogoColorCandidates.mockRejectedValue(new Error('unreadable'));
    render(
      <BrandPaletteEditor
        brandId="brand-1"
        label="Color palette"
        value={[]}
        isDisabled={false}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'fromLogo' }));

    expect(await screen.findByText('fromLogoFailed')).toBeInTheDocument();
  });
});
