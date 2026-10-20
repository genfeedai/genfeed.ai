import { act, fireEvent, render, screen } from '@testing-library/react';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.restoreAllMocks());

describe('VideoPlayer', () => {
  it('delegates rejected playback to the consumer without a Next image overlay', async () => {
    const error = new Error('Playback unavailable');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(error);
    const onPlaybackError = vi.fn();
    render(
      <VideoPlayer
        src="https://cdn.test/video.mp4"
        onPlaybackError={onPlaybackError}
        mediaProps={{ poster: 'https://cdn.test/poster.jpg' }}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Play video' })),
    );
    expect(onPlaybackError).toHaveBeenCalledWith(error);
    expect(screen.queryByAltText('Video unavailable')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Video player')).toHaveClass('opacity-100');
  });

  it('ignores a play promise interrupted by pause', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('Interrupted', 'AbortError'),
    );
    const onPlaybackError = vi.fn();
    render(
      <VideoPlayer
        src="https://cdn.test/video.mp4"
        onPlaybackError={onPlaybackError}
      />,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Play video' })),
    );
    expect(onPlaybackError).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Video unavailable')).not.toBeInTheDocument();
  });
  it('shows a native poster before metadata without a Next image request or loading cover', () => {
    render(
      <VideoPlayer
        src="https://cdn.test/video.mp4"
        mediaProps={{
          poster: 'https://cdn.test/poster.jpg',
          preload: 'metadata',
        }}
      />,
    );
    const video = screen.getByLabelText('Video player');
    expect(video).toHaveAttribute('poster', 'https://cdn.test/poster.jpg');
    expect(video).toHaveClass('opacity-100');
    expect(screen.queryByAltText('Video thumbnail')).not.toBeInTheDocument();
    expect(
      video.parentElement?.querySelector('.pointer-events-none'),
    ).toBeNull();
  });
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

  describe('total duration when metadata is already loaded (#7682)', () => {
    function stubLoadedMedia(duration: number, readyState = 4) {
      vi.spyOn(HTMLMediaElement.prototype, 'duration', 'get').mockReturnValue(
        duration,
      );
      vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
        readyState,
      );
    }

    it('shows the real total and enables seeking when loadedmetadata fired before mount settled', () => {
      stubLoadedMedia(10.125);
      render(<VideoPlayer src="https://cdn.test/done.mp4" />);

      const slider = screen.getByRole('slider', { name: 'Seek video' });
      expect(slider).toHaveAttribute('aria-valuemax', '10.125');
      expect(slider).not.toBeDisabled();
      expect(screen.getByText(/\/ 0:10/)).toBeInTheDocument();
    });

    it('re-syncs when the source changes on an already loaded element', () => {
      stubLoadedMedia(10.125);
      const { rerender } = render(<VideoPlayer src="https://cdn.test/a.mp4" />);
      rerender(<VideoPlayer src="https://cdn.test/a.mp4?grant=2" />);

      expect(
        screen.getByRole('slider', { name: 'Seek video' }),
      ).toHaveAttribute('aria-valuemax', '10.125');
    });

    it('keeps the total once playback has ended', () => {
      stubLoadedMedia(10.125);
      render(<VideoPlayer src="https://cdn.test/done.mp4" />);
      const video = screen.getByLabelText('Video player') as HTMLVideoElement;
      video.currentTime = 10.125;
      fireEvent.timeUpdate(video);
      fireEvent.ended(video);

      expect(screen.getByText(/0:10 \/ 0:10/)).toBeInTheDocument();
    });

    it('shows no total while the media length is still unknown', () => {
      stubLoadedMedia(Number.POSITIVE_INFINITY);
      render(<VideoPlayer src="https://cdn.test/stream.webm" />);

      expect(
        screen.getByRole('slider', { name: 'Seek video' }),
      ).toHaveAttribute('aria-valuemax', '1');
      expect(screen.getByText(/\/ 0:00/)).toBeInTheDocument();
    });
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
