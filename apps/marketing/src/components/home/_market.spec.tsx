import { render, screen, within } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeMarket from './_market';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <span aria-label={props.alt ?? ''} role="img" />
  ),
}));

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

  it('shows trends and a competitor ad', () => {
    render(<HomeMarket />);

    const tiles = within(
      screen.getByRole('list', { name: /example trends and competitor ads/i }),
    ).getAllByRole('listitem');

    expect(tiles.map((tile) => tile.textContent)).toEqual([
      expect.stringContaining('Trend'),
      expect.stringContaining('Trend'),
      expect.stringContaining('Competitor ad'),
    ]);
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

  it('does not promise results', () => {
    render(<HomeMarket />);

    expect(
      screen.queryByText(/grow|viral|more views|followers/i),
    ).not.toBeInTheDocument();
  });
});
