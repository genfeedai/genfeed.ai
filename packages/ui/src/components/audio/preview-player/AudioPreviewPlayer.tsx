'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { Button } from '@genfeedai/ui/primitives/button';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
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
    seek,
    toggle,
    toggleMute,
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
    isMuted,
    isPlaying,
    seek,
    toggle,
    toggleMute,
  } = useAudioPreview({ audioUrl, onError, stopOnUnmount });

  const playLabel = isPlaying
    ? `Pause preview for ${label}`
    : `Play preview for ${label}`;
  const PlayIcon = isLoading ? Loader2 : isPlaying ? Pause : Play;

  return (
    // ui-guard-allow:clickable-element -- stops the click from reaching a parent card; it is not an action
    <div
      className={cn('nodrag nopan flex items-center gap-2', className)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Button
        ariaLabel={playLabel}
        className="size-8 shrink-0 rounded-full"
        isDisabled={!audioUrl}
        onClick={toggle}
        size={ButtonSize.ICON}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        <PlayIcon
          aria-hidden="true"
          className={cn('size-4', isLoading && 'animate-spin')}
        />
      </Button>
      {isTimelineVisible && (
        <>
          <Slider
            aria-label={`Seek ${label}`}
            className="min-w-16 flex-1"
            disabled={!isCurrent || !duration}
            max={duration || 1}
            min={0}
            onValueChange={([time]) => {
              if (time !== undefined) seek(time);
            }}
            step={0.1}
            value={[Math.min(currentTime, duration || 0)]}
          />
          <span className="w-[11ch] shrink-0 whitespace-nowrap text-right text-2xs tabular-nums text-muted-foreground">
            {formatDuration(currentTime)}
            {duration > 0 ? ` / ${formatDuration(duration)}` : ''}
          </span>
          <Button
            ariaLabel={
              isMuted
                ? `Unmute preview for ${label}`
                : `Mute preview for ${label}`
            }
            className="size-7 shrink-0"
            isDisabled={!audioUrl}
            onClick={toggleMute}
            size={ButtonSize.ICON}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            {isMuted ? (
              <VolumeX aria-hidden="true" className="size-4" />
            ) : (
              <Volume2 aria-hidden="true" className="size-4" />
            )}
          </Button>
        </>
      )}
      {isErrored ? (
        <span className="shrink-0 text-xs text-destructive">
          Preview failed
        </span>
      ) : null}
    </div>
  );
}
