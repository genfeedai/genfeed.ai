import { fireEvent, render, screen } from '@testing-library/react';
import { HOME_OUTPUT_WALL_ASSETS } from '@web-components/home/_assets';
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
    calendly: 'https://calendly.com/genfeed/demo',
    mcpConnectHref: 'https://app.genfeed.ai/connect',
  },
}));

describe('HomeHero', () => {
  it('leads with the developer distribution promise and CTA hierarchy', () => {
    render(<HomeHero />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /your product deserves to be discovered\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/distribution infrastructure for ai agents/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/one prompt\. publish everywhere\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/connect claude code, codex, or any mcp client/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link').map((link) => link.textContent?.trim()),
    ).toEqual(['Connect MCP', 'Book a Demo']);
  });

  it('points the primary CTA at the canonical Connect Genfeed flow', () => {
    render(<HomeHero />);

    expect(screen.getByRole('link', { name: /connect mcp/i })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/connect',
    );
  });

  it('tracks Connect MCP separately from Book a Demo', () => {
    const listener = vi.fn();
    window.addEventListener('genfeed:marketing:button-click', listener);
    render(<HomeHero />);

    fireEvent.click(screen.getByRole('link', { name: /connect mcp/i }));
    fireEvent.click(screen.getByRole('link', { name: /book a demo/i }));

    expect(listener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'connect_mcp_hero' },
          trackingName: 'hero_cta_click',
        },
      }),
    );
    expect(listener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        detail: {
          trackingData: { action: 'book_demo_hero' },
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
