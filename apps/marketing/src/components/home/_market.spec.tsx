import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomeMarket from './_market';

describe('HomeMarket', () => {
  it('sells starting from what already works', () => {
    render(<HomeMarket />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Start from what is already working',
      }),
    ).toBeInTheDocument();
  });

  it('names what every account gets and what a plan adds', () => {
    render(<HomeMarket />);

    expect(
      screen.getByText('The shared market trends feed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /trends in your niche, competitor ads to save and remix, and trend videos that play inside genfeed\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See plans' })).toHaveAttribute(
      'href',
      '/pricing',
    );
  });

  it('shows no invented product screen', () => {
    render(<HomeMarket />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not promise results', () => {
    render(<HomeMarket />);

    expect(
      screen.queryByText(/grow|viral|more views|followers/i),
    ).not.toBeInTheDocument();
  });
});
