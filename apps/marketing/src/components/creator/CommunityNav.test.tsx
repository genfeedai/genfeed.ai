import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CommunityNav from './CommunityNav';

describe('CommunityNav', () => {
  it.each([
    ['Discover', '/community'],
    ['Creators', '/community/creators'],
    ['Videos', '/community/videos'],
    ['Images', '/community/images'],
    ['Articles', '/community/articles'],
    ['Posts', '/posts'],
  ])('links %s to %s', (name, href) => {
    render(<CommunityNav active="discover" />);

    const nav = screen.getByRole('navigation', { name: 'Community' });
    expect(within(nav).getByRole('link', { name })).toHaveAttribute(
      'href',
      href,
    );
  });

  it('marks the section being viewed', () => {
    render(<CommunityNav active="videos" />);

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Discover' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});
