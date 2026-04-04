import type { RefObject } from 'react';

/**
 * Stops and resets a video element to the beginning
 * @param video - The video element or ref to stop and reset
 */
export function stopAndResetVideo(
  video: HTMLVideoElement | RefObject<HTMLVideoElement | null> | null,
): void {
  if (!video) {
    return;
  }

  const videoElement =
    'current' in video ? video.current : (video as HTMLVideoElement);

  if (!videoElement) {
    return;
  }

  videoElement.pause();
  videoElement.currentTime = 0;
}
