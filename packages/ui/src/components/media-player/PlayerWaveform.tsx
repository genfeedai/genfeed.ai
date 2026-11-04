'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useMemo,
} from 'react';
import { createWaveformPeaks } from './waveform-peaks';

const SEEK_STEP_SECONDS = 5;

export interface PlayerWaveformProps {
  /** What the bars are a fingerprint of: the asset URL or id. */
  seed: string;
  peakCount: number;
  currentTime: number;
  duration: number;
  isDisabled?: boolean;
  label: string;
  onSeek: (time: number) => void;
  className?: string;
}

/**
 * The scrubber of every MediaPlayer variant. Bars up to the playhead are
 * filled; a click or drag seeks, and the arrow keys step five seconds.
 */
export default function PlayerWaveform({
  seed,
  peakCount,
  currentTime,
  duration,
  isDisabled = false,
  label,
  onSeek,
  className,
}: PlayerWaveformProps) {
  const peaks = useMemo(
    () => createWaveformPeaks(seed, peakCount),
    [seed, peakCount],
  );
  const total = duration > 0 ? duration : 0;
  const clampedTime = Math.min(currentTime, total);
  const progress = total > 0 ? (clampedTime / total) * 100 : 0;

  const seekToPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (isDisabled || bounds.width <= 0) return;
      const fraction = Math.min(
        1,
        Math.max(0, (event.clientX - bounds.left) / bounds.width),
      );
      onSeek(fraction * total);
    },
    [isDisabled, onSeek, total],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isDisabled || total <= 0) return;
    const steps: Record<string, number | undefined> = {
      ArrowLeft: Math.max(0, clampedTime - SEEK_STEP_SECONDS),
      ArrowRight: Math.min(total, clampedTime + SEEK_STEP_SECONDS),
      End: total,
      Home: 0,
    };
    const nextTime = steps[event.key];
    if (nextTime === undefined) return;
    event.preventDefault();
    onSeek(nextTime);
  };

  return (
    // ui-guard-allow:clickable-element -- a waveform slider: pointer scrubbing mirrors the keyboard arrows on the same element
    <div
      aria-disabled={isDisabled}
      aria-label={`Seek ${label}`}
      aria-orientation="horizontal"
      aria-valuemax={total || 1}
      aria-valuemin={0}
      aria-valuenow={clampedTime}
      aria-valuetext={`${formatDuration(clampedTime)} of ${formatDuration(total)}`}
      className={cn(
        'relative min-w-16 flex-1 cursor-pointer rounded-sm touch-none',
        isDisabled && 'cursor-default opacity-60',
        className,
      )}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        seekToPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekToPointer(event);
      }}
      role="slider"
      tabIndex={isDisabled ? -1 : 0}
    >
      <div aria-hidden="true" className="flex h-full items-center gap-0.5">
        {peaks.map((peak, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder.
            key={index}
            className="min-w-px flex-1 rounded-full bg-muted-foreground/30"
            style={{ height: `${peak}%` }}
          />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center gap-0.5"
        style={{ clipPath: `inset(0 ${100 - progress}% 0 0)` }}
      >
        {peaks.map((peak, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder.
            key={index}
            className="min-w-px flex-1 rounded-full bg-foreground"
            style={{ height: `${peak}%` }}
          />
        ))}
      </div>
    </div>
  );
}
