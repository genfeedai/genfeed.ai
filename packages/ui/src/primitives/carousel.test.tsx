import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Carousel,
  CarouselContent,
  CarouselCounter,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from './carousel';

describe('Carousel', () => {
  it('names the carousel and each slide for assistive technology', () => {
    render(
      <Carousel label="Photos">
        <CarouselContent>
          <CarouselItem>One</CarouselItem>
          <CarouselItem>Two</CarouselItem>
        </CarouselContent>
        <CarouselPrevious label="Previous slide" />
        <CarouselNext label="Next slide" />
        <CarouselCounter />
      </Carousel>,
    );

    expect(screen.getByRole('region', { name: 'Photos' })).toHaveAttribute(
      'aria-roledescription',
      'carousel',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Previous slide' }),
    ).toBeDisabled();
  });

  it('refuses to draw a part outside a carousel', () => {
    expect(() => render(<CarouselNext label="Next slide" />)).toThrow(
      'Carousel parts must be used inside <Carousel>',
    );
  });
});
