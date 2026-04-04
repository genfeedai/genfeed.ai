import { useCallback } from 'react';

let currentAudio: HTMLAudioElement | null = null;

export function useAudioPlayer() {
  const play = useCallback((url: string, onEnded?: () => void) => {
    if (!url) {
      return;
    }

    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    const audio = new Audio(url);

    audio.onended = () => {
      currentAudio = null;
      if (onEnded) {
        onEnded();
      }
    };

    currentAudio = audio;

    audio.play();
  }, []);

  const stop = useCallback(() => {
    if (!currentAudio) {
      return;
    }

    currentAudio.onended = null;
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }, []);

  return { play, stop };
}
