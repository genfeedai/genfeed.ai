import { render, screen } from '@testing-library/react';
import AssetHoverDetails from '@ui/ingredients/asset-hover-details';
import { describe, expect, it } from 'vitest';

import { hoverConcealClassName, hoverRevealClassName } from './hover-reveal';

describe('hoverRevealClassName', () => {
  it('stays visible without hover and hides only on a hover-capable pointer', () => {
    const classes = hoverRevealClassName().split(' ');

    expect(classes).toContain('opacity-100');
    expect(classes).toContain('pointer-events-auto');
    expect(classes).not.toContain('opacity-0');
    expect(classes).not.toContain('pointer-events-none');
    expect(classes).toContain('[@media(hover:hover)]:opacity-0');
    expect(classes).toContain('[@media(hover:hover)]:pointer-events-none');
    expect(classes).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    expect(classes).toContain(
      '[@media(hover:hover)]:group-hover:pointer-events-auto',
    );
    expect(classes).toContain(
      '[@media(hover:hover)]:group-focus-within:opacity-100',
    );
    expect(classes).toContain(
      '[@media(hover:hover)]:group-focus-within:pointer-events-auto',
    );
  });

  it('opens over the hover-capable hide without dropping the touch-visible classes', () => {
    const open = hoverRevealClassName({ isOpen: true });

    expect(open).toContain('opacity-100');
    expect(open).toContain('pointer-events-auto');
    expect(open).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    expect(open).not.toContain('[@media(hover:hover)]:opacity-0');
    expect(open).not.toContain('[@media(hover:hover)]:pointer-events-none');
  });

  it('hides a resting label on touch and while its paired action is revealed', () => {
    const classes = hoverConcealClassName({ focus: 'group-visible' }).split(
      ' ',
    );

    expect(classes).toContain('opacity-0');
    expect(classes).toContain('[@media(hover:hover)]:opacity-100');
    expect(classes).toContain('[@media(hover:hover)]:group-hover:opacity-0');
    expect(classes).toContain(
      '[@media(hover:hover)]:group-focus-visible:opacity-0',
    );
  });
});

describe('AssetHoverDetails', () => {
  it('reveals actions on touch and does not leave them clickable while hidden', () => {
    const { container } = render(
      <AssetHoverDetails
        actions={<span>Make clips</span>}
        metadata="12s"
        typeLabel="Video"
      />,
    );
    const details = container.querySelector('[data-asset-hover-details]');

    expect(details).toHaveClass(
      'opacity-100',
      '[@media(hover:hover)]:opacity-0',
      '[@media(hover:hover)]:pointer-events-none',
      '[@media(hover:hover)]:group-hover:pointer-events-auto',
      '[@media(hover:hover)]:group-focus-within:opacity-100',
    );
    expect(details).not.toHaveClass('opacity-0');
    expect(screen.getByText('Make clips').parentElement).not.toHaveClass(
      'pointer-events-auto',
    );
  });
});
