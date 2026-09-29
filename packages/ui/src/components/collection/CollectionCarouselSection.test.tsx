import { fireEvent, render, screen } from '@testing-library/react';
import CollectionCarouselSection from '@ui/collection/CollectionCarouselSection';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function setRailGeometry(
  rail: HTMLElement,
  geometry: { clientWidth: number; scrollLeft: number; scrollWidth: number },
) {
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(rail, key, { configurable: true, value });
  }
}

describe('CollectionCarouselSection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows no arrows when the rail fits its content', () => {
    render(
      <CollectionCarouselSection itemCount={1} title="Featured">
        <div>card</div>
      </CollectionCarouselSection>,
    );

    expect(screen.queryByLabelText('Scroll left')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Scroll right')).not.toBeInTheDocument();
  });

  it('puts the arrows in the section header, disabled at the rail edges', () => {
    render(
      <CollectionCarouselSection itemCount={3} title="Featured">
        <div>card</div>
      </CollectionCarouselSection>,
    );
    const rail = screen.getByText('card').parentElement as HTMLElement;

    setRailGeometry(rail, {
      clientWidth: 400,
      scrollLeft: 0,
      scrollWidth: 900,
    });
    fireEvent.scroll(rail);

    const header = screen.getByRole('heading', { name: 'Featured' })
      .parentElement?.parentElement as HTMLElement;
    expect(header).toContainElement(screen.getByLabelText('Scroll right'));
    expect(screen.getByLabelText('Scroll left')).toBeDisabled();
    expect(screen.getByLabelText('Scroll right')).toBeEnabled();

    setRailGeometry(rail, {
      clientWidth: 400,
      scrollLeft: 500,
      scrollWidth: 900,
    });
    fireEvent.scroll(rail);

    expect(screen.getByLabelText('Scroll left')).toBeEnabled();
    expect(screen.getByLabelText('Scroll right')).toBeDisabled();
  });

  it('scrolls one measured card per press', () => {
    render(
      <CollectionCarouselSection gap="md" itemCount={2} title="Featured">
        <div>card</div>
      </CollectionCarouselSection>,
    );
    const card = screen.getByText('card');
    const rail = card.parentElement as HTMLElement;
    const scrollBy = vi.fn();
    rail.scrollBy = scrollBy;
    card.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;

    setRailGeometry(rail, {
      clientWidth: 400,
      scrollLeft: 0,
      scrollWidth: 900,
    });
    fireEvent.scroll(rail);
    fireEvent.click(screen.getByLabelText('Scroll right'));

    expect(scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 216 });
  });
});
