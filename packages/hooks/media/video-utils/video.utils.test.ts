import { stopAndResetVideo } from '@hooks/media/video-utils/video.utils';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';

const createVideoElement = () => {
  const video = document.createElement('video');
  video.pause = vi.fn();
  video.currentTime = 12;
  return video;
};

describe('stopAndResetVideo', () => {
  it('returns early when no video is provided', () => {
    expect(() => stopAndResetVideo(null)).not.toThrow();
  });

  it('pauses and resets the video element', () => {
    const video = createVideoElement();

    stopAndResetVideo(video);

    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });

  it('pauses and resets when using a ref', () => {
    const video = createVideoElement();
    const ref: RefObject<HTMLVideoElement> = { current: video };

    stopAndResetVideo(ref);

    expect(video.pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
  });
});
