import { render, screen } from '@testing-library/react';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { describe, expect, it } from 'vitest';

describe('LazyLoadingFallback', () => {
  it('uses the shared spinner for minimal fallbacks', () => {
    const { container } = render(<LazyLoadingFallback variant="minimal" />);

    expect(container.firstChild).toHaveClass('min-h-[60vh]');
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'animate-spin',
    );
  });

  it('uses the shared spinner for full-page fallbacks', () => {
    const { container } = render(<LazyLoadingFallback variant="full" />);

    expect(container.firstChild).toHaveClass('min-h-screen');
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'animate-spin',
    );
  });
});
