'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { Button } from '@genfeedai/ui/primitives/button';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { useEffect, useMemo, useState } from 'react';

type SharedAudioStatus = 'idle' | 'loading' | 'paused' | 'playing' | 'error';

type SharedAudioSnapshot = {
  currentUrl: string | null;
  currentTime: number;
  duration: number;
  status: SharedAudioStatus;
};

const listeners = new Set<() => void>();

let sharedAudio: HTMLAudioElement | null = null;
let sharedSnapshot: SharedAudioSnapshot = {
  currentUrl: null,
  currentTime: 0,
  duration: 0,
  status: 'idle',
};

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
  }

  return sharedAudio;
}

export interface AudioPreviewPlayerProps {
  audioUrl?: string | null;
  className?: string;
  onError?: () => void;
  isTimelineVisible?: boolean;
  label: string;
}

export default function AudioPreviewPlayer({
  audioUrl,
  label,
  className,
  onError,
  isTimelineVisible = false,
}: AudioPreviewPlayerProps) {
  const [snapshot, setSnapshot] = useState(sharedSnapshot);

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

  const isErrored = isCurrent && snapshot.status === 'error';
  useEffect(() => {
    if (isErrored) onError?.();
  }, [isErrored, onError]);

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

    if (isCurrent && !audio.paused) {
      audio.pause();
      return;
    }

    setSharedSnapshot({
      currentUrl: audioUrl,
      status: 'loading',
      ...(isCurrent ? {} : { currentTime: 0, duration: 0 }),
    });

    if (audio.src !== audioUrl) {
      audio.src = audioUrl;
    }

    try {
      await audio.play();
    } catch {
      setSharedSnapshot({ currentUrl: audioUrl, status: 'error' });
    }
  };

  return (
    <div className={cn('nodrag nopan flex items-center gap-2', className)}>
      <Button
        ariaLabel={
          isPlaying ? `Pause preview for ${label}` : `Play preview for ${label}`
        }
        isDisabled={!audioUrl}
        onClick={() => {
          handleToggle().catch(() => {
            setSharedSnapshot({
              currentUrl: audioUrl ?? null,
              status: 'error',
            });
          });
        }}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        {!audioUrl
          ? 'No Preview'
          : isLoading
            ? 'Loading…'
            : isPlaying
              ? 'Pause'
              : 'Play'}
      </Button>
      {isTimelineVisible && (
        <div className="min-w-0 flex-1 space-y-1">
          <Slider
            aria-label={`Seek ${label}`}
            min={0}
            max={isCurrent && snapshot.duration ? snapshot.duration : 1}
            step={0.1}
            value={[isCurrent ? snapshot.currentTime : 0]}
            disabled={!isCurrent || !snapshot.duration}
            onValueChange={([time]) => {
              if (sharedAudio && isCurrent && time !== undefined)
                sharedAudio.currentTime = time;
            }}
          />
          <span className="block text-2xs tabular-nums text-muted-foreground">
            {formatDuration(isCurrent ? snapshot.currentTime : 0)} /{' '}
            {formatDuration(isCurrent ? snapshot.duration : 0)}
          </span>
        </div>
      )}
      {isErrored ? (
        <span className="text-xs text-destructive">Preview failed</span>
      ) : null}
    </div>
  );
}
