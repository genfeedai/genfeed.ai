import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
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
      screen.getByRole('link', { name: /start creating free/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /book a demo/i }),
    ).toBeInTheDocument();
  });

  it('points the primary CTA at the pay-as-you-go sign-up', () => {
    render(<HomeHero />);

    expect(
      screen.getByRole('link', { name: /start creating free/i }),
    ).toHaveAttribute('href', expect.stringContaining('plan=payg'));
  });

  it('renders the generated output wall instead of the old card deck', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-output-wall')).toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-card-deck')).not.toBeInTheDocument();
  });
});
