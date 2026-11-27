import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnderlineNav } from './underline-nav';

const ITEMS = [
  { href: '/a', isActive: false, label: 'First' },
  { badge: <span>3</span>, href: '/b', isActive: true, label: 'Second' },
];

describe('UnderlineNav', () => {
  it('links each item and marks only the active one as the current page', () => {
    render(<UnderlineNav ariaLabel="Sections" items={ITEMS} />);

    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('link', { name: 'First' })).toHaveAttribute(
      'href',
      '/a',
    );
    expect(
      within(nav).getByRole('link', { name: 'First' }),
    ).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Second 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('switches in place on a plain click and leaves a modified click to the browser', () => {
    const onSelect = vi.fn();
    render(
      <UnderlineNav
        ariaLabel="Sections"
        items={[{ href: '/a', isActive: false, label: 'First', onSelect }]}
      />,
    );
    const link = screen.getByRole('link', { name: 'First' });

    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { button: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
