import { render, screen } from '@testing-library/react';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import { describe, expect, it } from 'vitest';

describe('OrderedMasonry', () => {
  it('preserves native media ratios in one full-width layout', () => {
    const { container } = render(
      <OrderedMasonry>
        <div key="portrait" style={{ aspectRatio: '9 / 16' }}>
          Portrait
        </div>
        <div key="landscape" style={{ aspectRatio: '16 / 9' }}>
          Landscape
        </div>
        <div key="square" style={{ aspectRatio: '1 / 1' }}>
          Square
        </div>
      </OrderedMasonry>,
    );

    const masonry = container.querySelector('[data-masonry-layout="ordered"]');
    expect(masonry).toHaveStyle({ gap: '8px', width: '100%' });
    expect(screen.getByText('Portrait')).toHaveStyle({ aspectRatio: '9 / 16' });
    expect(screen.getByText('Landscape')).toHaveStyle({
      aspectRatio: '16 / 9',
    });
    expect(screen.getByText('Square')).toHaveStyle({ aspectRatio: '1 / 1' });
    expect(
      Array.from(masonry?.children ?? [], (item) => item.textContent),
    ).toEqual(['Portrait', 'Landscape', 'Square']);
  });

  it('keeps keyed tile identity and keyboard order when the sort changes', () => {
    const first = (
      <button key="first" type="button">
        First
      </button>
    );
    const second = (
      <button key="second" type="button">
        Second
      </button>
    );
    const { rerender } = render(
      <OrderedMasonry>{[first, second]}</OrderedMasonry>,
    );
    const firstButton = screen.getByRole('button', { name: 'First' });
    const secondButton = screen.getByRole('button', { name: 'Second' });

    rerender(<OrderedMasonry>{[second, first]}</OrderedMasonry>);

    expect(screen.getAllByRole('button')).toEqual([secondButton, firstButton]);
    expect(screen.getByRole('button', { name: 'First' })).toBe(firstButton);
  });

  it('removes every tile when the results become empty', () => {
    const { container, rerender } = render(
      <OrderedMasonry>
        <div key="result">Result</div>
      </OrderedMasonry>,
    );
    expect(screen.getByText('Result')).toBeInTheDocument();

    rerender(<OrderedMasonry>{[]}</OrderedMasonry>);

    expect(container.querySelector('[data-masonry-item]')).toBeNull();
    expect(screen.queryByText('Result')).not.toBeInTheDocument();
  });
});
