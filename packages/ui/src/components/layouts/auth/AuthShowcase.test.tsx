import type { AuthShowcaseSlide } from '@genfeedai/props/layout/auth-showcase.props';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AuthShowcase from '@ui/layouts/auth/AuthShowcase';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    sizes: _sizes,
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

const SLIDES: AuthShowcaseSlide[] = [
  {
    caption: 'Golden-hour fitness ad',
    id: 'gym',
    modelLabel: 'Seedance 2.0 Fast',
    posterSrc: 'https://cdn.example/gym-poster.webp',
    selectLabel: 'Show the Seedance 2.0 Fast example',
    videoSrc: 'https://cdn.example/gym.mp4',
  },
  {
    caption: 'Night orbit through neon rain',
    id: 'run',
    modelLabel: 'Veo 3.1 Fast',
    posterSrc: 'https://cdn.example/run-poster.webp',
    selectLabel: 'Show the Veo 3.1 Fast example',
    videoSrc: 'https://cdn.example/run.mp4',
  },
];

function mockMedia({ isDesktop, isReducedMotion }: Record<string, boolean>) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      matches: query.includes('prefers-reduced-motion')
        ? isReducedMotion
        : isDesktop,
      removeEventListener: vi.fn(),
    })),
  );
}

function renderShowcase() {
  return render(
    <AuthShowcase
      pauseLabel="Pause"
      playLabel="Play"
      regionLabel="Examples"
      slides={SLIDES}
    />,
  );
}

describe('AuthShowcase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays the first example muted, labelled with its model and caption', () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = renderShowcase();
    const video = container.querySelector('video') as HTMLVideoElement;

    expect(video.muted).toBe(true);
    expect(video.loop).toBe(false);
    expect(video).toHaveAttribute('src', SLIDES[0]?.videoSrc);
    expect(screen.getByText('Golden-hour fitness ad')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: SLIDES[0]?.selectLabel }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('moves to the next example when a clip ends and wraps around', () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = renderShowcase();

    fireEvent.ended(container.querySelector('video') as HTMLVideoElement);
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      SLIDES[1]?.videoSrc,
    );
    expect(screen.getByText('Night orbit through neon rain')).toBeVisible();

    fireEvent.ended(container.querySelector('video') as HTMLVideoElement);
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      SLIDES[0]?.videoSrc,
    );
  });

  it('jumps to an example from its progress bar', () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = renderShowcase();

    fireEvent.click(
      screen.getByRole('button', { name: SLIDES[1]?.selectLabel }),
    );

    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      SLIDES[1]?.videoSrc,
    );
    expect(
      screen.getByRole('button', { name: SLIDES[1]?.selectLabel }),
    ).toHaveAttribute('aria-current', 'true');
  });

  it('follows the video element instead of assuming a toggle worked', async () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = renderShowcase();
    const video = container.querySelector('video') as HTMLVideoElement;

    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();

    fireEvent.play(video);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    // A browser that blocks playback rejects play(): the control must not
    // claim the clip is running.
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    video.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    fireEvent.pause(video);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument(),
    );
  });

  it('shows stills under reduced motion and lets people pick one', () => {
    mockMedia({ isDesktop: true, isReducedMotion: true });
    const { container } = renderShowcase();

    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      SLIDES[0]?.posterSrc,
    );

    fireEvent.click(
      screen.getByRole('button', { name: SLIDES[1]?.selectLabel }),
    );

    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      SLIDES[1]?.posterSrc,
    );
    expect(screen.getByText('Night orbit through neon rain')).toBeVisible();
  });

  it('does not load the video below desktop width', () => {
    mockMedia({ isDesktop: false, isReducedMotion: false });
    const { container } = renderShowcase();

    expect(container.querySelector('video')).toBeNull();
  });
});
