import type { HomeOutputAsset } from '@props/website/home.props';
import { act, render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomeOutputCard from './_output-card';

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

const ASSET: HomeOutputAsset = {
  alt: 'Generated short-form video',
  format: 'Short-form video',
  mp4: 'https://cdn.genfeed.ai/reels.mp4',
  poster: 'https://cdn.genfeed.ai/reels-poster.webp',
  title: 'Made to move',
  webm: 'https://cdn.genfeed.ai/reels.webm',
};

/**
 * jsdom implements neither IntersectionObserver nor playback. The observer is
 * captured so a test can decide when the card scrolls into view, and `play` is
 * stubbed so the component's own call does not throw.
 */
let intersect: ((entries: { isIntersecting: boolean }[]) => void) | undefined;

function stubEnvironment({
  isReducedMotion = false,
  isSavingData = false,
}: {
  isReducedMotion?: boolean;
  isSavingData?: boolean;
} = {}): void {
  intersect = undefined;

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = callback;
      }
      disconnect() {
        /* noop mock */
      }
      observe() {
        /* noop mock */
      }
      unobserve() {
        /* noop mock */
      }
    },
  );

  vi.stubGlobal('matchMedia', () => ({
    addEventListener: vi.fn(),
    matches: isReducedMotion,
    removeEventListener: vi.fn(),
  }));

  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: { saveData: isSavingData },
  });

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
    /* noop mock */
  });
}

describe('HomeOutputCard', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the poster and no clip until the card is scrolled to', () => {
    stubEnvironment();
    render(<HomeOutputCard asset={ASSET} isPreloaded={false} />);

    expect(screen.getByRole('img')).toHaveAttribute('data-src', ASSET.poster);
    expect(
      screen.queryByTestId('home-hero-output-carousel-video'),
    ).not.toBeInTheDocument();
  });

  it('fetches the clip once the card comes into view', () => {
    stubEnvironment();
    render(<HomeOutputCard asset={ASSET} isPreloaded={false} />);

    act(() => intersect?.([{ isIntersecting: true }]));

    const player = screen.getByTestId('home-hero-output-carousel-video');

    expect(player).toHaveAttribute('poster', ASSET.poster);
    expect(player).toHaveAttribute('loop');
    expect(player.hasAttribute('controls')).toBe(false);
    expect(
      Array.from(player.querySelectorAll('source')).map((source) =>
        source.getAttribute('type'),
      ),
    ).toEqual(['video/webm', 'video/mp4']);
  });

  it('never fetches the clip when motion is reduced', () => {
    stubEnvironment({ isReducedMotion: true });
    render(<HomeOutputCard asset={ASSET} isPreloaded={false} />);

    expect(intersect).toBeUndefined();
    expect(
      screen.queryByTestId('home-hero-output-carousel-video'),
    ).not.toBeInTheDocument();
  });

  it('never fetches the clip when the visitor asked to save data', () => {
    stubEnvironment({ isSavingData: true });
    render(<HomeOutputCard asset={ASSET} isPreloaded={false} />);

    expect(intersect).toBeUndefined();
  });

  it('preloads the poster only for the card that asks for it', () => {
    stubEnvironment();
    const { rerender } = render(
      <HomeOutputCard asset={ASSET} isPreloaded={false} />,
    );

    expect(screen.getByRole('img')).toHaveAttribute('data-priority', 'false');

    rerender(<HomeOutputCard asset={ASSET} isPreloaded />);

    expect(screen.getByRole('img')).toHaveAttribute('data-priority', 'true');
  });

  it('names the format and the claim on the card', () => {
    stubEnvironment();
    render(<HomeOutputCard asset={ASSET} isPreloaded={false} />);

    expect(screen.getByText(ASSET.format)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: ASSET.title }),
    ).toBeInTheDocument();
  });
});
