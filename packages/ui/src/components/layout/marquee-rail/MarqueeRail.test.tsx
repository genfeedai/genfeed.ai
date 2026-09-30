import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarqueeRail from './MarqueeRail';

function renderRail() {
  return render(
    <MarqueeRail>
      <span data-testid="item">One</span>
      <span data-testid="item">Two</span>
    </MarqueeRail>,
  );
}

describe('MarqueeRail', () => {
  it('renders the row twice so the loop has no visible restart', () => {
    renderRail();

    expect(screen.getAllByTestId('item')).toHaveLength(4);
  });

  it('announces the row only once', () => {
    renderRail();

    const announced = screen
      .getAllByTestId('item')
      .filter((item) => !item.closest('[aria-hidden="true"]'));

    expect(announced.map((item) => item.textContent)).toEqual(['One', 'Two']);
  });

  it('takes the duplicate out of the tab order', () => {
    const { container } = renderRail();
    const copy = container.querySelector('[aria-hidden="true"]');

    expect(copy).not.toBeNull();
    expect(copy?.hasAttribute('inert')).toBe(true);
  });

  it('leaves nothing for the visitor to operate', () => {
    renderRail();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the gap inside each copy, not between them', () => {
    const { container } = render(
      <MarqueeRail gapPx={20}>
        <span>One</span>
      </MarqueeRail>,
    );
    const copy = container.querySelector<HTMLElement>('[aria-hidden="true"]');

    // Half the track has to be exactly one copy for the restart to land on the
    // item it replaces, which only holds when the gap belongs to the copy.
    expect(copy?.style.gap).toBe('20px');
    expect(copy?.style.paddingRight).toBe('20px');
  });
});
