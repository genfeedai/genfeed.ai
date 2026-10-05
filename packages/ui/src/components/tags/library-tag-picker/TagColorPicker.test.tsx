import { TAG_COLOR_PALETTE } from '@genfeedai/contracts/constants';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TagColorPicker from './TagColorPicker';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('TagColorPicker', () => {
  it('offers every palette swatch by name', () => {
    render(<TagColorPicker onChange={vi.fn()} />);

    for (const swatch of TAG_COLOR_PALETTE) {
      expect(screen.getByRole('button', { name: swatch.name })).toBeVisible();
    }
  });

  it('hands back the whole swatch, so the text color travels with it', () => {
    const onChange = vi.fn();
    render(<TagColorPicker onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Amber' }));

    expect(onChange).toHaveBeenCalledWith({
      backgroundColor: '#FBBF24',
      name: 'Amber',
      textColor: '#000000',
    });
  });

  it('marks the swatch in effect, whatever the casing of the stored color', () => {
    render(<TagColorPicker onChange={vi.fn()} value="#2563eb" />);

    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
