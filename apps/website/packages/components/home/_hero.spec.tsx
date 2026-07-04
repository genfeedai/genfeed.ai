import { render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeHero from './_hero';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority: _priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    <span
      aria-label={props.alt ?? ''}
      data-src={typeof props.src === 'string' ? props.src : undefined}
      role="img"
    />
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
      screen.getByRole('link', { name: /see formats/i }),
    ).toBeInTheDocument();
  });

  it('renders the generated output wall instead of the old card deck', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-output-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-card-deck')).not.toBeInTheDocument();
  });
});
