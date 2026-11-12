import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CreatorFooter from './CreatorFooter';
import CreatorTopbar from './CreatorTopbar';

describe('CreatorTopbar', () => {
  it('offers the logo and one sign-up link, without the site menu', () => {
    render(<CreatorTopbar />);

    const signUp = screen.getByRole('link', { name: 'Make your own' });

    expect(new URL(signUp.getAttribute('href') ?? '').pathname).toBe(
      '/sign-up',
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText(/pricing/i)).toBeNull();
  });
});

describe('CreatorFooter', () => {
  it('keeps one line of links so the page is not a crawl dead end', () => {
    render(<CreatorFooter />);

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/pricing',
      'https://docs.genfeed.ai',
      '/terms',
      '/privacy',
    ]);
  });
});
