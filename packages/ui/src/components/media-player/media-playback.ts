'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

type SharedAudioStatus = 'idle' | 'loading' | 'paused' | 'playing' | 'error';

type SharedAudioSnapshot = {
  currentUrl: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  status: SharedAudioStatus;
};

const listeners = new Set<() => void>();

let sharedAudio: HTMLAudioElement | null = null;
let sharedSnapshot: SharedAudioSnapshot = {
  currentUrl: null,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  status: 'idle',
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return sharedSnapshot;
}

function emitSnapshot() {
  listeners.forEach((listener) => {
    listener();
  });
}

function setSharedSnapshot(nextSnapshot: Partial<SharedAudioSnapshot>) {
  sharedSnapshot = { ...sharedSnapshot, ...nextSnapshot };
  emitSnapshot();
}

function ensureSharedAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'none';

    sharedAudio.addEventListener('playing', () => {
      setSharedSnapshot({
        currentUrl: sharedAudio?.src ?? null,
        status: 'playing',
      });
    });
    sharedAudio.addEventListener('pause', () => {
      if (!sharedAudio?.ended) {
        setSharedSnapshot({
          currentUrl: sharedAudio?.src ?? null,
          status: 'paused',
        });
      }
    });
    sharedAudio.addEventListener('ended', () => {
      setSharedSnapshot({
        currentUrl: null,
        status: 'idle',
      });
    });
    sharedAudio.addEventListener('error', () => {
      setSharedSnapshot({
        currentUrl: sharedAudio?.src ?? null,
        status: 'error',
      });
    });
    const updateProgress = () =>
      setSharedSnapshot({
        currentTime: sharedAudio?.currentTime ?? 0,
        duration:
          sharedAudio && Number.isFinite(sharedAudio.duration)
            ? sharedAudio.duration
            : 0,
      });
    sharedAudio.addEventListener('loadedmetadata', updateProgress);
    sharedAudio.addEventListener('timeupdate', updateProgress);
    sharedAudio.addEventListener('durationchange', updateProgress);
    sharedAudio.addEventListener('volumechange', () =>
      setSharedSnapshot({
        isMuted: sharedAudio?.muted ?? false,
        volume: sharedAudio?.volume ?? 1,
      }),
    );
  }

  return sharedAudio;
}

export interface UseMediaPlaybackParams {
  audioUrl?: string | null;
  onError?: () => void;
  stopOnUnmount?: boolean;
}

/**
 * One shared audio element for every MediaPlayer: playing a sample stops the
 * previous one. Exposed so a dense picker can lay out its own controls.
 */
export function useMediaPlayback({
  audioUrl,
  onError,
  stopOnUnmount = false,
}: UseMediaPlaybackParams) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(
    () => () => {
      if (
        stopOnUnmount &&
        audioUrl &&
        sharedAudio &&
        new URL(sharedAudio.src, document.baseURI).href ===
          new URL(audioUrl, document.baseURI).href
      )
        sharedAudio.pause();
    },
    [audioUrl, stopOnUnmount],
  );

  const isCurrent = useMemo(() => {
    if (!audioUrl || !snapshot.currentUrl) {
      return false;
    }

    try {
      return (
        new URL(snapshot.currentUrl, document.baseURI).toString() ===
        new URL(audioUrl, document.baseURI).toString()
      );
    } catch {
      return snapshot.currentUrl === audioUrl;
    }
  }, [audioUrl, snapshot.currentUrl]);

  const isErrored = isCurrent && snapshot.status === 'error';
  useEffect(() => {
    if (isErrored) onError?.();
  }, [isErrored, onError]);

  const isLoading = isCurrent && snapshot.status === 'loading';
  const isPlaying = isCurrent && snapshot.status === 'playing';

  const handleToggle = async (startAt?: number) => {
    if (!audioUrl) {
      return;
    }

    const audio = ensureSharedAudio();

    if (!audio) {
      return;
    }

    if (isCurrent && !audio.paused && startAt === undefined) {
      audio.pause();
      return;
    }

    setSharedSnapshot({
      currentUrl: audioUrl,
      status: 'loading',
      ...(isCurrent ? {} : { currentTime: startAt ?? 0, duration: 0 }),
    });

    if (audio.src !== new URL(audioUrl, document.baseURI).toString()) {
      audio.src = audioUrl;
    }
    // Before metadata loads this sets where playback will start.
    if (startAt !== undefined) audio.currentTime = startAt;

    try {
      await audio.play();
    } catch {
      setSharedSnapshot({ currentUrl: audioUrl, status: 'error' });
    }
  };

  const run = (startAt?: number) => {
    handleToggle(startAt).catch(() => {
      setSharedSnapshot({
        currentUrl: audioUrl ?? null,
        status: 'error',
      });
    });
  };

  const toggle = () => run();

  /** Starts this clip at `time`, loading it first when another one is current. */
  const playFrom = (time: number) => run(time);

  const seek = (time: number) => {
    if (sharedAudio && isCurrent) sharedAudio.currentTime = time;
  };

  const toggleMute = () => {
    if (!sharedAudio) return;
    sharedAudio.muted = !sharedAudio.muted;
    setSharedSnapshot({ isMuted: sharedAudio.muted });
  };

  return {
    currentTime: isCurrent ? snapshot.currentTime : 0,
    duration: isCurrent ? snapshot.duration : 0,
    isCurrent,
    isErrored,
    isLoading,
    isPlaying,
    isMuted: snapshot.isMuted,
    playFrom,
    seek,
    toggle,
    toggleMute,
    volume: snapshot.volume,
  };
}
