/**
 * Get the dimensions of an image from its source URL or data URL.
 */
export function getImageDimensions(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ height: img.height, width: img.width });
    img.onerror = () => resolve({ height: 0, width: 0 });
    img.src = src;
  });
}

/**
 * Get duration and dimensions of a video from its source URL or data URL.
 */
export function getVideoMetadata(src: string): Promise<{
  duration: number;
  dimensions: { width: number; height: number };
}> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.onloadedmetadata = () =>
      resolve({
        dimensions: { height: video.videoHeight, width: video.videoWidth },
        duration: video.duration,
      });
    video.onerror = () =>
      resolve({ dimensions: { height: 0, width: 0 }, duration: 0 });
    video.src = src;
  });
}
