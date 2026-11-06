import { render, screen } from '@testing-library/react';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { describe, expect, it } from 'vitest';

describe('CollectionGrid', () => {
  it('resolves columns from its container, never viewport breakpoints', () => {
    render(
      <CollectionGrid data-testid="grid" maxColumns={4}>
        <div>a</div>
      </CollectionGrid>,
    );

    const wrapper = screen.getByTestId('grid');
    const grid = wrapper.firstElementChild as HTMLElement;

    expect(wrapper).toHaveClass('@container');
    expect(grid).toHaveClass(
      'grid-cols-1',
      '@[40rem]:grid-cols-2',
      '@[60rem]:grid-cols-3',
      '@[80rem]:grid-cols-4',
      'gap-4',
    );
    expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl|2xl):grid-cols/);
  });

  it('climbs to four columns by default', () => {
    render(
      <CollectionGrid data-testid="grid">
        <div>a</div>
      </CollectionGrid>,
    );

    expect(screen.getByTestId('grid').firstElementChild).toHaveClass(
      '@[80rem]:grid-cols-4',
    );
  });

  it('caps the ladder at the requested column count', () => {
    render(
      <CollectionGrid data-testid="grid" maxColumns={2}>
        <div>a</div>
      </CollectionGrid>,
    );

    const grid = screen.getByTestId('grid').firstElementChild as HTMLElement;
    expect(grid).toHaveClass('@[40rem]:grid-cols-2');
    expect(grid.className).not.toContain('grid-cols-3');
  });

  it('uses the tighter tile gap for tile density', () => {
    render(
      <CollectionGrid data-testid="grid" density="tile">
        <div>a</div>
      </CollectionGrid>,
    );

    expect(screen.getByTestId('grid').firstElementChild).toHaveClass('gap-3');
  });
});
