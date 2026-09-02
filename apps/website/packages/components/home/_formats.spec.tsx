import { render, screen } from '@testing-library/react';
import HomeFormats from '@web-components/home/_formats';
import { describe, expect, it } from 'vitest';

describe('HomeFormats', () => {
  it('renders the section heading and primary CTA', () => {
    render(<HomeFormats />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /every format you post\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see pricing/i })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('lists every output format', () => {
    render(<HomeFormats />);

    for (const title of [
      'Images & posts',
      'Reels & short video',
      'Podcasts & voice',
      'Newsletters',
      'Ads & creatives',
      'AI influencers',
      'Articles & SEO',
      'YouTube & thumbnails',
    ]) {
      expect(
        screen.getByRole('heading', { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });

  it('leaves credit pricing to the pricing page', () => {
    render(<HomeFormats />);

    expect(screen.queryByText(/from [\d,]+ credits/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/≈ \$\d/)).not.toBeInTheDocument();
  });
});
