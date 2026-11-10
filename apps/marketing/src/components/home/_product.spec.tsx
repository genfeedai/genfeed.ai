import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeProduct from './_product';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
  ),
}));

describe('HomeProduct', () => {
  it('says Genfeed covers all content, not only video', () => {
    render(<HomeProduct />);

    expect(screen.getByText('Not just video')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One agent for all your content.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('home-product-workspace')).toBeInTheDocument();
    expect(screen.getByText('8 drafts ready for review')).toBeInTheDocument();
  });

  it.each([
    ['Short-form video', 'Reels, TikTok, Shorts'],
    ['Posts', 'X, LinkedIn, Threads'],
    ['Images', 'Instagram, Pinterest, your store'],
    ['Presenter video', 'One face, one voice'],
    ['Articles', 'Your blog'],
    ['Newsletters', 'Your list'],
    ['Ads', 'Every ratio, ready for the ad account'],
    ['Voice', 'Voice-overs and podcasts'],
  ])('shows %s and where it ships', (label, destination) => {
    render(<HomeProduct />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(destination)).toBeInTheDocument();
  });

  it('uses the existing generated stills for the media pieces', () => {
    render(<HomeProduct />);

    expect(screen.getAllByRole('img')).toHaveLength(4);
  });
});
