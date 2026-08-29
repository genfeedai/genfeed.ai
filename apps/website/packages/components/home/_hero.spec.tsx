import { fireEvent, render, screen } from '@testing-library/react';
import { HOME_OUTPUT_WALL_ASSETS } from '@web-components/home/_assets';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import HomeHero from './_hero';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    priority,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  }) => (
    <span
      aria-label={props.alt ?? ''}
      data-priority={priority ? 'true' : 'false'}
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
    calendly: 'https://calendly.com/genfeed/demo',
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

describe('HomeHero', () => {
  it('leads with the SaaS studio promise and CTA hierarchy', () => {
    render(<HomeHero />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /one brief\. every channel\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/the ai content studio/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /drafts the posts, makes the images and video, and publishes on your schedule/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Start creating', 'Use the Agent']);
  });

  it('states the mechanism instead of an adjective', () => {
    render(<HomeHero />);

    expect(
      screen.queryByText(/generate, review, schedule, publish\./i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/platform-native content out/i),
    ).not.toBeInTheDocument();
  });

  it('preloads exactly one output-wall image for the LCP', () => {
    render(<HomeHero />);

    const preloaded = screen
      .getAllByRole('img')
      .filter((image) => image.getAttribute('data-priority') === 'true');

    expect(preloaded).toHaveLength(1);
    expect(preloaded[0]).toHaveAttribute(
      'data-src',
      HOME_OUTPUT_WALL_ASSETS[0].src,
    );
  });

  it('never shows fabricated studio metrics', () => {
    render(<HomeHero />);

    expect(
      screen.queryByText(/sample studio readout/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/31% hook rate/i)).not.toBeInTheDocument();
  });

  it('sends each CTA to its own destination', () => {
    render(<HomeHero />);

    expect(
      screen.getByRole('link', { name: /start creating/i }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/sign-up');
    expect(
      screen.getByRole('link', { name: /use the agent/i }),
    ).toHaveAttribute('href', '/mcp');
  });

  it('tracks Start creating separately from Use the Agent', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<HomeHero />);

    fireEvent.click(screen.getByRole('link', { name: /start creating/i }));
    fireEvent.click(screen.getByRole('link', { name: /use the agent/i }));

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'start_creating_hero' },
          trackingName: 'hero_cta_click',
        },
      }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'use_agent_hero' },
          trackingName: 'hero_cta_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });

  it('renders a CDN-backed generated output wall instead of static wall art', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-output-wall')).toBeInTheDocument();
    expect(
      screen.getByTestId('home-hero-content-wall-grid'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('home-hero-output-wall-item')).toHaveLength(
      HOME_OUTPUT_WALL_ASSETS.length,
    );
    expect(screen.queryByTestId('home-hero-card-deck')).not.toBeInTheDocument();

    const imageSources = screen
      .getAllByRole('img')
      .map((image) => image.getAttribute('data-src'));

    expect(imageSources).toEqual(
      HOME_OUTPUT_WALL_ASSETS.map((asset) => asset.src),
    );
    expect(
      imageSources.some((src) => src?.includes('generated-output-wall.png')),
    ).toBe(false);
  });
});
