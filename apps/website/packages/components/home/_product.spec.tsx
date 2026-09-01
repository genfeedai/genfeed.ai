import { render, screen } from '@testing-library/react';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeProduct from './_product';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

describe('HomeProduct', () => {
  it('explains the one-brief product mechanism after the output showcase', () => {
    render(<HomeProduct />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /one brief\. every channel\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('home-product-workspace')).toBeInTheDocument();
    expect(screen.getByText('5 outputs ready')).toBeInTheDocument();
  });

  it('uses existing generated media without adding another preload', () => {
    render(<HomeProduct />);

    expect(screen.getAllByRole('img')).toHaveLength(5);
    expect(
      screen.getAllByRole('img').map((image) => image.getAttribute('data-src')),
    ).toEqual(HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 5).map(({ src }) => src));
  });
});
