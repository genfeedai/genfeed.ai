import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClipperModeSelector from './ClipperModeSelector';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  return { useTranslations: translateFromCatalog };
});

describe('ClipperModeSelector', () => {
  it('shows raw-cut as selected and explains that identity is not required', () => {
    render(<ClipperModeSelector mode="raw-cut" onModeChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: /raw cut/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByText(/no avatar or voice required/i),
    ).toBeInTheDocument();
  });

  it('switches to avatar mode', () => {
    const onModeChange = vi.fn();
    render(<ClipperModeSelector mode="raw-cut" onModeChange={onModeChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /ai avatar/i }));

    expect(onModeChange).toHaveBeenCalledWith('avatar');
  });
});
