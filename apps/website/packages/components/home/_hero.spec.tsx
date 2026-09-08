import { fireEvent, render, screen } from '@testing-library/react';
import {
  HOME_HERO_VIDEO,
  HOME_OUTPUT_CAROUSEL_ASSETS,
} from '@web-components/home/_assets';
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

vi.mock('@web-components/home/_hero-video', () => ({
  default: ({ posterSrc }: { posterSrc: string }) => (
    <div data-poster={posterSrc} data-testid="home-hero-video" />
  ),
}));

vi.mock('@web-components/home/_output-card', () => ({
  default: ({
    asset,
    isPreloaded,
  }: {
    asset: { poster: string; title: string };
    isPreloaded: boolean;
  }) => (
    <figure
      data-poster={asset.poster}
      data-preloaded={isPreloaded ? 'true' : 'false'}
      data-testid="home-hero-output-carousel-item"
    >
      {asset.title}
    </figure>
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

  it('drops the eyebrow that told visitors whose site they were on', () => {
    render(<HomeHero />);

    expect(screen.queryByText(/made with genfeed/i)).not.toBeInTheDocument();
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

  it('plays a generated clip behind the headline', () => {
    render(<HomeHero />);

    expect(screen.getByTestId('home-hero-video')).toHaveAttribute(
      'data-poster',
      HOME_HERO_VIDEO.poster,
    );
  });

  it('preloads only the first card in the rail', () => {
    render(<HomeHero />);

    const preloaded = screen
      .getAllByTestId('home-hero-output-carousel-item')
      .filter((card) => card.getAttribute('data-preloaded') === 'true');

    expect(preloaded).toHaveLength(1);
    expect(preloaded[0]).toHaveAttribute(
      'data-poster',
      HOME_OUTPUT_CAROUSEL_ASSETS[0]?.poster,
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

    const cards = screen.getAllByTestId('home-hero-output-carousel-item');

    expect(cards).toHaveLength(HOME_OUTPUT_CAROUSEL_ASSETS.length);
    expect(cards.map((card) => card.getAttribute('data-poster'))).toEqual(
      HOME_OUTPUT_CAROUSEL_ASSETS.map((asset) => asset.poster),
    );
    expect(
      screen.queryByTestId('home-hero-output-wall'),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-hero-card-deck')).not.toBeInTheDocument();
  });
});
