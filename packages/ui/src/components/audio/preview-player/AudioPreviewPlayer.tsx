'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { Button } from '@genfeedai/ui/primitives/button';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

type SharedAudioStatus = 'idle' | 'loading' | 'paused' | 'playing' | 'error';

type SharedAudioSnapshot = {
  currentUrl: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  status: SharedAudioStatus;
};

const listeners = new Set<() => void>();

let sharedAudio: HTMLAudioElement | null = null;
let sharedSnapshot: SharedAudioSnapshot = {
  currentUrl: null,
  currentTime: 0,
  duration: 0,
  volume: 1,
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
      setSharedSnapshot({ volume: sharedAudio?.volume ?? 1 }),
    );
  }

  return sharedAudio;
}

export interface AudioPreviewPlayerProps {
  audioUrl?: string | null;
  className?: string;
  onError?: () => void;
  isTimelineVisible?: boolean;
  stopOnUnmount?: boolean;
  label: string;
}

export interface UseAudioPreviewParams {
  audioUrl?: string | null;
  onError?: () => void;
  stopOnUnmount?: boolean;
}

/**
 * One shared audio element for every preview: playing a sample stops the
 * previous one. Exposed so dense pickers can lay out their own controls.
 */
export function useAudioPreview({
  audioUrl,
  onError,
  stopOnUnmount = false,
}: UseAudioPreviewParams) {
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

    if (audio.src !== new URL(audioUrl, document.baseURI).toString()) {
      audio.src = audioUrl;
    }

    try {
      await audio.play();
    } catch {
      setSharedSnapshot({ currentUrl: audioUrl, status: 'error' });
    }
  };

  const toggle = () => {
    handleToggle().catch(() => {
      setSharedSnapshot({
        currentUrl: audioUrl ?? null,
        status: 'error',
      });
    });
  };

  return {
    currentTime: isCurrent ? snapshot.currentTime : 0,
    duration: isCurrent ? snapshot.duration : 0,
    isCurrent,
    isErrored,
    isLoading,
    isPlaying,
    toggle,
    volume: snapshot.volume,
  };
}

export default function AudioPreviewPlayer({
  audioUrl,
  label,
  className,
  onError,
  isTimelineVisible = false,
  stopOnUnmount = false,
}: AudioPreviewPlayerProps) {
  const {
    currentTime,
    duration,
    isCurrent,
    isErrored,
    isLoading,
    isPlaying,
    toggle,
    volume,
  } = useAudioPreview({ audioUrl, onError, stopOnUnmount });

  return (
    <div
      className={cn('nodrag nopan flex items-center gap-2', className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        ariaLabel={
          isPlaying ? `Pause preview for ${label}` : `Play preview for ${label}`
        }
        isDisabled={!audioUrl}
        onClick={toggle}
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
            max={duration || 1}
            step={0.1}
            value={[currentTime]}
            disabled={!isCurrent || !duration}
            onValueChange={([time]) => {
              if (sharedAudio && isCurrent && time !== undefined)
                sharedAudio.currentTime = time;
            }}
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-2xs tabular-nums text-muted-foreground">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>
            <Slider
              aria-label={`Volume for ${label}`}
              min={0}
              max={1}
              step={0.1}
              value={[volume]}
              className="max-w-16"
              disabled={!isCurrent}
              onValueChange={([nextVolume]) => {
                if (sharedAudio && isCurrent && nextVolume !== undefined) {
                  sharedAudio.volume = nextVolume;
                  setSharedSnapshot({ volume: nextVolume });
                }
              }}
            />
          </div>
        </div>
      )}
      {isErrored ? (
        <span className="text-xs text-destructive">Preview failed</span>
      ) : null}
    </div>
  );
}
