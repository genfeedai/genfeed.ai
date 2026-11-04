'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import { Button } from '@genfeedai/ui/primitives/button';
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMediaPlayback } from './media-playback';
import PlayerWaveform from './PlayerWaveform';

/**
 * - `button`: a play button, for a dense picker.
 * - `row`: play, waveform and time on one line, for lists and tables.
 * - `inspector`: a larger waveform with time and mute, for a side panel.
 * - `tile`: a self-contained masonry tile for audio, voice and music.
 */
export type MediaPlayerVariant = 'button' | 'row' | 'inspector' | 'tile';

export interface MediaPlayerProps {
  src?: string | null;
  label: string;
  variant?: MediaPlayerVariant;
  className?: string;
  onError?: () => void;
  stopOnUnmount?: boolean;
  /** Length in seconds when the asset already knows it, so time shows before the first play. */
  knownDuration?: number;
  /** Tile caption: the asset's prompt or name. */
  title?: string;
  /** Tile caption: one muted line, such as the model or voice. */
  meta?: string;
  /** Tile type badge, pinned top left. */
  badge?: ReactNode;
}

const PEAK_COUNT: Record<MediaPlayerVariant, number> = {
  button: 0,
  inspector: 64,
  row: 40,
  tile: 44,
};

export default function MediaPlayer({
  src,
  label,
  variant = 'button',
  className,
  onError,
  stopOnUnmount = false,
  knownDuration = 0,
  title,
  meta,
  badge,
}: MediaPlayerProps) {
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
  } = useMediaPlayback({ audioUrl: src, onError, stopOnUnmount });

  const playLabel = isPlaying
    ? `Pause preview for ${label}`
    : `Play preview for ${label}`;
  const PlayIcon = isLoading ? Loader2 : isPlaying ? Pause : Play;
  const total = duration || knownDuration;
  const timeText =
    total > 0
      ? `${formatDuration(currentTime)} / ${formatDuration(total)}`
      : formatDuration(currentTime);
  const isTile = variant === 'tile';
  const isInspector = variant === 'inspector';

  const playButton = (
    <Button
      ariaLabel={playLabel}
      className={cn(
        'shrink-0 rounded-full',
        isTile || isInspector ? 'size-10' : 'size-8',
      )}
      isDisabled={!src}
      onClick={toggle}
      size={ButtonSize.ICON}
      variant={
        variant === 'button' ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
      }
      withWrapper={false}
    >
      <PlayIcon
        aria-hidden="true"
        className={cn('size-4', isLoading && 'animate-spin')}
      />
    </Button>
  );

  const waveform =
    variant === 'button' ? null : (
      <PlayerWaveform
        // A waveform scrubs only the clip that is loaded; before that a click starts playback.
        className={cn(
          variant === 'row' && 'h-7',
          isInspector && 'h-16',
          isTile && 'h-[52px]',
        )}
        currentTime={currentTime}
        duration={total}
        isDisabled={!src}
        label={label}
        onSeek={(time) => (isCurrent ? seek(time) : toggle())}
        peakCount={PEAK_COUNT[variant]}
        seed={src || label}
      />
    );

  const time = (
    <span className="shrink-0 whitespace-nowrap text-right text-2xs tabular-nums text-muted-foreground">
      {timeText}
    </span>
  );

  const failure = isErrored ? (
    <span className="shrink-0 text-xs text-destructive">Preview failed</span>
  ) : null;

  return (
    // ui-guard-allow:clickable-element -- stops the click from reaching a parent card; it is not an action
    <div
      className={cn(
        'nodrag nopan',
        (variant === 'button' || variant === 'row') &&
          'flex items-center gap-2',
        isInspector && 'flex flex-col gap-2',
        isTile && 'relative flex flex-col gap-3 p-3 pt-10',
        className,
      )}
      data-media-player={variant}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isTile && badge ? (
        <div className="absolute top-2 left-2">{badge}</div>
      ) : null}

      {isInspector ? (
        <>
          <div className="flex items-center gap-3">
            {playButton}
            {waveform}
          </div>
          <div className="flex items-center justify-between gap-2">
            {time}
            <Button
              ariaLabel={
                isMuted
                  ? `Unmute preview for ${label}`
                  : `Mute preview for ${label}`
              }
              className="size-7 shrink-0"
              isDisabled={!src}
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
          </div>
        </>
      ) : isTile ? (
        <>
          <div className="flex items-center gap-3">
            {playButton}
            {waveform}
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? (
              <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                {title}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{meta}</span>
              {time}
            </div>
          </div>
        </>
      ) : (
        <>
          {playButton}
          {waveform}
          {variant === 'row' ? time : null}
        </>
      )}
      {failure}
    </div>
  );
}
