import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandBanner } from './brand-banner';

describe('BrandBanner', () => {
  it('is always the X header frame, 1500x500', () => {
    const { container } = render(
      <BrandBanner alt="Genfeed banner" src="https://cdn.example/banner.png" />,
    );

    expect(container.firstElementChild?.getAttribute('data-ratio')).toBe(
      '1500x500',
    );
    expect(
      container.firstElementChild?.classList.contains('aspect-[3/1]'),
    ).toBe(true);
  });

  it('shows the picture when there is one and an empty frame when there is none', () => {
    const { container, rerender } = render(
      <BrandBanner alt="Genfeed banner" src="https://cdn.example/banner.png" />,
    );
    expect(screen.getByRole('img', { name: 'Genfeed banner' })).toBeTruthy();

    rerender(<BrandBanner alt="Genfeed banner" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.firstElementChild?.getAttribute('data-ratio')).toBe(
      '1500x500',
    );
  });
});
