import { render } from '@testing-library/react';
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
  it('takes the duplicate out of the tab order', () => {
    const { container } = renderRail();
    const copy = container.querySelector('[aria-hidden="true"]');

    expect(copy).not.toBeNull();
    expect(copy?.hasAttribute('inert')).toBe(true);
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
