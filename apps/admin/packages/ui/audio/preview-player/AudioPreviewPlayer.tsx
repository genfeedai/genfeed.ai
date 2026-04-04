'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { useEffect, useMemo, useState } from 'react';

type SharedAudioStatus = 'idle' | 'loading' | 'paused' | 'playing';

type SharedAudioSnapshot = {
  currentUrl: string | null;
  status: SharedAudioStatus;
};

const listeners = new Set<() => void>();

let sharedAudio: HTMLAudioElement | null = null;
let sharedSnapshot: SharedAudioSnapshot = {
  currentUrl: null,
  status: 'idle',
};

function emitSnapshot() {
  listeners.forEach((listener) => listener());
}

function setSharedSnapshot(nextSnapshot: SharedAudioSnapshot) {
  sharedSnapshot = nextSnapshot;
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
        currentUrl: null,
        status: 'idle',
      });
    });
  }

  return sharedAudio;
}

export interface AudioPreviewPlayerProps {
  audioUrl?: string | null;
  label: string;
}

export default function AudioPreviewPlayer({
  audioUrl,
  label,
}: AudioPreviewPlayerProps) {
  const [snapshot, setSnapshot] = useState(sharedSnapshot);
  const [isErrored, setIsErrored] = useState(false);

  useEffect(() => {
    const listener = () => {
      setSnapshot({ ...sharedSnapshot });
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const isCurrent = useMemo(() => {
    if (!audioUrl || !snapshot.currentUrl) {
      return false;
    }

    try {
      return (
        new URL(snapshot.currentUrl).toString() === new URL(audioUrl).toString()
      );
    } catch {
      return snapshot.currentUrl === audioUrl;
    }
  }, [audioUrl, snapshot.currentUrl]);

  const isLoading = isCurrent && snapshot.status === 'loading';
  const isPlaying = isCurrent && snapshot.status === 'playing';

  const handleToggle = async () => {
    if (!audioUrl) {
      return;
    }

    const audio = ensureSharedAudio();

    if (!audio) {
      return;
    }

    setIsErrored(false);

    if (isCurrent && !audio.paused) {
      audio.pause();
      return;
    }

    setSharedSnapshot({
      currentUrl: audioUrl,
      status: 'loading',
    });

    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
    }

    try {
      await audio.play();
    } catch {
      setIsErrored(true);
      setSharedSnapshot({
        currentUrl: null,
        status: 'idle',
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        ariaLabel={
          isPlaying ? `Pause preview for ${label}` : `Play preview for ${label}`
        }
        isDisabled={!audioUrl}
        onClick={() => {
          handleToggle().catch(() => {
            setIsErrored(true);
          });
        }}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        {!audioUrl
          ? 'No Preview'
          : isLoading
            ? 'Loading...'
            : isPlaying
              ? 'Pause'
              : 'Play'}
      </Button>
      {isErrored ? (
        <span className="text-xs text-destructive">Preview failed</span>
      ) : null}
    </div>
  );
}
