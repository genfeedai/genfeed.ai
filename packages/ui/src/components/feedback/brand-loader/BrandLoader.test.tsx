import { render, screen } from '@testing-library/react';
import BrandLoader from '@ui/feedback/brand-loader/BrandLoader';
import { describe, expect, it } from 'vitest';

describe('BrandLoader', () => {
  it('draws the canonical mark as inline SVG paths', () => {
    const { container } = render(<BrandLoader />);

    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading Genfeed',
    );
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelectorAll('svg path')).toHaveLength(2);
    expect(container.querySelector('.genfeed-loader-trace')).toHaveAttribute(
      'pathLength',
      '1',
    );
  });
});
