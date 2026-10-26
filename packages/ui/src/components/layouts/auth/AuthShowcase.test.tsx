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

describe('AuthShowcase', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a muted video with a pause control on desktop', () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = render(
      <AuthShowcase pauseLabel="Pause" playLabel="Play" />,
    );

    expect(container.querySelector('video')?.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('follows the video element instead of assuming a toggle worked', async () => {
    mockMedia({ isDesktop: true, isReducedMotion: false });
    const { container } = render(
      <AuthShowcase pauseLabel="Pause" playLabel="Play" />,
    );
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

  it('shows only the poster under reduced motion', () => {
    mockMedia({ isDesktop: true, isReducedMotion: true });
    const { container } = render(
      <AuthShowcase pauseLabel="Pause" playLabel="Play" />,
    );

    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('does not load the video below desktop width', () => {
    mockMedia({ isDesktop: false, isReducedMotion: false });
    const { container } = render(
      <AuthShowcase pauseLabel="Pause" playLabel="Play" />,
    );

    expect(container.querySelector('video')).toBeNull();
  });
});
