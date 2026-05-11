import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeHero from './_hero';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => (
    // biome-ignore lint/performance/noImgElement: next/image is mocked to a basic DOM element in jsdom tests.
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
      screen.getByRole('link', { name: /start cloud app/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /book a demo/i }),
    ).toBeInTheDocument();
  });

  it('renders the cloud console visual instead of the poster visual', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-cloud-console')).toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-poster')).not.toBeInTheDocument();
  });
});
