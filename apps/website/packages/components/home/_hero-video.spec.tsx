import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeHeroVideo from './_hero-video';

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

const ASSETS = {
  alt: 'Generated creator footage',
  mp4Src: 'https://cdn.genfeed.ai/hero-loop.mp4',
  posterSrc: 'https://cdn.genfeed.ai/hero-loop-poster.webp',
  webmSrc: 'https://cdn.genfeed.ai/hero-loop.webm',
};

/**
 * jsdom has no `matchMedia`. Each test declares the environment it is standing
 * in — wide vs narrow, motion allowed vs reduced — and the component decides.
 */
function stubMedia({
  isReducedMotion = false,
  isSavingData = false,
  isWide = true,
}: {
  isReducedMotion?: boolean;
  isSavingData?: boolean;
  isWide?: boolean;
}): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: vi.fn(),
    matches: query.includes('reduced-motion') ? isReducedMotion : isWide,
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: isSavingData },
  });
}

describe('HomeHeroVideo', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('paints the poster on the server so the still carries the LCP', () => {
    stubMedia({});
    render(<HomeHeroVideo {...ASSETS} />);

    const poster = screen.getByRole('img');

    expect(poster).toHaveAttribute('data-src', ASSETS.posterSrc);
    expect(poster).toHaveAttribute('data-priority', 'true');
  });

  it('hands playback the same still it is replacing', () => {
    stubMedia({});
    render(<HomeHeroVideo {...ASSETS} />);

    const player = screen.getByTestId('home-hero-video-player');

    expect(player).toHaveAttribute('poster', ASSETS.posterSrc);
    expect(player).toHaveAttribute('loop');
    expect(player).toHaveAttribute('autoplay');
    expect(player).toHaveAttribute('playsinline');
    expect(player.hasAttribute('controls')).toBe(false);
  });

  it('offers WebM before falling back to MP4', () => {
    stubMedia({});
    render(<HomeHeroVideo {...ASSETS} />);

    const sources = Array.from(
      screen.getByTestId('home-hero-video-player').querySelectorAll('source'),
    );

    expect(sources.map((source) => source.getAttribute('type'))).toEqual([
      'video/webm',
      'video/mp4',
    ]);
  });

  it('never fetches the clip when motion is reduced', () => {
    stubMedia({ isReducedMotion: true });
    render(<HomeHeroVideo {...ASSETS} />);

    expect(
      screen.queryByTestId('home-hero-video-player'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute(
      'data-src',
      ASSETS.posterSrc,
    );
  });

  it('never fetches the clip on a narrow screen', () => {
    stubMedia({ isWide: false });
    render(<HomeHeroVideo {...ASSETS} />);

    expect(
      screen.queryByTestId('home-hero-video-player'),
    ).not.toBeInTheDocument();
  });

  it('never fetches the clip when the visitor asked to save data', () => {
    stubMedia({ isSavingData: true });
    render(<HomeHeroVideo {...ASSETS} />);

    expect(
      screen.queryByTestId('home-hero-video-player'),
    ).not.toBeInTheDocument();
  });

  it('exposes a pause control only while something is moving', () => {
    stubMedia({});
    render(<HomeHeroVideo {...ASSETS} />);

    expect(screen.getByTestId('home-hero-video-toggle')).toBeInTheDocument();
  });

  it('drops the pause control when there is nothing to pause', () => {
    stubMedia({ isReducedMotion: true });
    render(<HomeHeroVideo {...ASSETS} />);

    expect(
      screen.queryByTestId('home-hero-video-toggle'),
    ).not.toBeInTheDocument();
  });
});
