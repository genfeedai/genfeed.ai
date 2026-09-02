import { fireEvent, render, screen } from '@testing-library/react';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
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
  it('leads with generated output and preserves the CTA hierarchy', () => {
    render(<HomeHero />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /everything your brand can become\./i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/made with genfeed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/every format\. one recognisable brand\./i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Start creating', 'Use the Agent']);

    const actions = screen.getByTestId('home-hero-actions');
    const carousel = screen.getByTestId('home-hero-output-carousel');

    expect(
      actions.compareDocumentPosition(carousel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it('preloads exactly one carousel image for the LCP', () => {
    render(<HomeHero />);

    const preloaded = screen
      .getAllByRole('img')
      .filter((image) => image.getAttribute('data-priority') === 'true');

    expect(preloaded).toHaveLength(1);
    expect(preloaded[0]).toHaveAttribute(
      'data-src',
      HOME_OUTPUT_CAROUSEL_ASSETS[0].src,
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
    ).toHaveAttribute('href', '/agent');
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
          trackingName: 'home_hero_click',
        },
      }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'use_agent_hero' },
          trackingName: 'home_hero_click',
        },
      }),
    );

    window.removeEventListener('genfeed:marketing:button-click', listener);
  });

  it('renders a CDN-backed generated output carousel', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-output-carousel')).toBeInTheDocument();
    expect(
      screen.getAllByTestId('home-hero-output-carousel-item'),
    ).toHaveLength(HOME_OUTPUT_CAROUSEL_ASSETS.length);
    expect(
      screen.queryByTestId('home-hero-output-wall'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-card-deck')).not.toBeInTheDocument();

    const imageSources = screen
      .getAllByRole('img')
      .map((image) => image.getAttribute('data-src'));

    expect(imageSources).toEqual(
      HOME_OUTPUT_CAROUSEL_ASSETS.map((asset) => asset.src),
    );
    expect(
      imageSources.some((src) => src?.includes('generated-output-wall.png')),
    ).toBe(false);
  });
});
