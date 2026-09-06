import { act, fireEvent, render, screen } from '@testing-library/react';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('VideoPlayer', () => {
  it('keeps the poster visible before playback and pauses inactive slides', () => {
    vi.useFakeTimers();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const props = {
      src: 'https://cdn.test/video.mp4',
      thumbnail: 'https://cdn.test/poster.jpg',
      mediaProps: { preload: 'none' as const },
    };
    const { rerender } = render(<VideoPlayer {...props} />);
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByAltText('Video thumbnail')).toBeInTheDocument();
    rerender(<VideoPlayer {...props} isActive={false} />);
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.loadedData(screen.getByLabelText('Video player'));
    expect(screen.queryByAltText('Video thumbnail')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('uses shared transport controls and forwards playback events and refs', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValue();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    const onPlay = vi.fn();
    const onEnded = vi.fn();
    const onClick = vi.fn();
    const videoRef = createRef<HTMLVideoElement>();
    render(
      <VideoPlayer
        src="https://cdn.test/video.mp4"
        videoRef={videoRef}
        mediaProps={{ onPlay, onEnded, onClick }}
      />,
    );
    const video = screen.getByLabelText('Video player');
    expect(videoRef.current).toBe(video);
    expect(video).not.toHaveAttribute('controls');
    fireEvent.click(screen.getByRole('button', { name: 'Play video' }));
    expect(play).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();
    Object.defineProperty(video, 'paused', {
      configurable: true,
      value: false,
    });
    fireEvent.play(video);
    expect(onPlay).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: 'Play video' }),
    ).toBeInTheDocument();
  });

  it('exposes seek duration, mute and fullscreen through shared controls', () => {
    render(<VideoPlayer src="https://cdn.test/video.mp4" />);
    const video = screen.getByLabelText('Video player') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    const slider = screen.getByRole('slider', { name: 'Seek video' });
    expect(slider).toHaveAttribute('aria-valuemax', '60');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(video.currentTime).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Mute video' }));
    expect(video.muted).toBe(true);
    fireEvent.volumeChange(video);
    expect(
      screen.getByRole('button', { name: 'Unmute video' }),
    ).toBeInTheDocument();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(video.parentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Toggle fullscreen' }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('keeps silent previews control-free and resets failed state when the source changes', () => {
    const onError = vi.fn();
    const { rerender } = render(
      <VideoPlayer
        src="https://cdn.test/broken.mp4"
        mediaProps={{ controls: false, onError }}
      />,
    );
    fireEvent.error(screen.getByLabelText('Video player'));
    expect(onError).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('group', { name: 'Video controls' }),
    ).not.toBeInTheDocument();
    rerender(
      <VideoPlayer
        src="https://cdn.test/ready.mp4"
        mediaProps={{ controls: false }}
      />,
    );
    fireEvent.loadedData(screen.getByLabelText('Video player'));
    expect(screen.getByLabelText('Video player')).toHaveClass('opacity-100');
    expect(screen.queryByAltText('Video unavailable')).not.toBeInTheDocument();
  });
});
