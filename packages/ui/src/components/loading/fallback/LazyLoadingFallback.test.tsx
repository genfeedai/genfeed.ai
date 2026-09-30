import { render, screen } from '@testing-library/react';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { describe, expect, it } from 'vitest';

describe('LazyLoadingFallback', () => {
  it('renders the skeleton fallback by default', () => {
    const { container } = render(<LazyLoadingFallback />);

    expect(container.firstChild).toHaveAttribute(
      'aria-label',
      'Loading content',
    );
  });

  it('uses the brand loader for minimal fallbacks', () => {
    const { container } = render(<LazyLoadingFallback variant="minimal" />);

    expect(container.firstChild).toHaveClass('min-h-[60vh]');
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'genfeed-loader-root',
    );
  });

  it('uses the brand loader for full-page fallbacks', () => {
    const { container } = render(<LazyLoadingFallback variant="full" />);

    expect(container.firstChild).toHaveClass('min-h-screen');
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass(
      'genfeed-loader-root',
    );
  });
});
