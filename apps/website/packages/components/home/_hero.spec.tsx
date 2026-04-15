import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeHero from './_hero';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: next/image test double
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: {
      app: 'https://app.genfeed.ai',
    },
  },
}));

describe('HomeHero', () => {
  it('renders one primary heading with both CTAs', () => {
    render(<HomeHero />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('link', { name: /start creating/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view pricing/i }),
    ).toBeInTheDocument();
  });

  it('renders the Instagram-style hero card deck instead of the poster visual', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-card-deck')).toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-poster')).not.toBeInTheDocument();
  });
});
