import { logger } from '@services/core/logger.service';

export function playAudio(url: string, onEnded?: () => void) {
  if (!url) {
    return;
  }

  // Create a new audio instance
  const audio = new Audio(url);

  // Add ended event listener if provided
  if (onEnded) {
    audio.addEventListener('ended', onEnded);
  }

  // Function to stop the audio
  const stop = () => {
    audio.pause();
    audio.currentTime = 0;
    if (onEnded) {
      audio.removeEventListener('ended', onEnded);
    }
  };

  // Play the audio
  audio.play().catch((error) => {
    logger.error('Failed to play audio:', error);
  });

  // Return both the audio element and the stop function
  return {
    audioElement: audio,
    stop,
  };
}
