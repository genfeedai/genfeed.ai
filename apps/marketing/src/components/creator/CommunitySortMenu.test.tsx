import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CommunitySortMenu, { communitySortHref } from './CommunitySortMenu';

describe('communitySortHref', () => {
  it.each([
    ['newest' as const, '/community/videos'],
    ['views' as const, '/community/videos?sort=views'],
    ['recreations' as const, '/community/videos?sort=recreations'],
  ])('links the %s order to %s', (sort, expected) => {
    expect(communitySortHref('/community/videos', sort)).toBe(expected);
  });
});

describe('CommunitySortMenu', () => {
  it('shows the current order and links to the others', () => {
    render(<CommunitySortMenu active="views" basePath="/community/images" />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Most viewed' }), {
      key: 'Enter',
    });

    expect(
      screen.getByRole('menuitem', { name: 'Most recreated' }),
    ).toHaveAttribute('href', '/community/images?sort=recreations');
    expect(screen.getByRole('menuitem', { name: 'Newest' })).toHaveAttribute(
      'href',
      '/community/images',
    );
    expect(
      screen.getByRole('menuitem', { name: 'Most viewed' }),
    ).toHaveAttribute('aria-current', 'true');
  });
});
