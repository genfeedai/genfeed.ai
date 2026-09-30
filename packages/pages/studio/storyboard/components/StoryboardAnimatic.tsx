'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { StoryboardAnimaticProps } from '@genfeedai/props/studio/storyboard.props';
import { Button } from '@ui/primitives/button';
import { Pause, Play, RotateCcw } from 'lucide-react';
import NextImage from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

function timecode(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)
    .toString()
    .padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`;
}

/** Displays persisted stills and dialogue only. It never calls a generation service. */
export default function StoryboardAnimatic({
  scope,
  shots,
}: StoryboardAnimaticProps) {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [singleShot, setSingleShot] = useState<string>();
  const clock = useRef({ started: 0, elapsed: 0 });
  const playable =
    shots.length > 0 &&
    shots.every(
      (shot) =>
        shot.durationSeconds !== null &&
        shot.durationSeconds > 0 &&
        Boolean(shot.stillUrl),
    );
  const ranges = shots.map((shot, index) => {
    const start = shots
      .slice(0, index)
      .reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);
    return { shot, start, end: start + (shot.durationSeconds ?? 0) };
  });
  const total = ranges.at(-1)?.end ?? 0;
  const current =
    (singleShot &&
      ranges.find(
        (range) => range.shot.id === singleShot && elapsed >= range.end,
      )) ||
    ranges.find((range) => elapsed < range.end) ||
    ranges.at(-1);
  const end = singleShot
    ? (ranges.find((range) => range.shot.id === singleShot)?.end ?? total)
    : total;
  const pause = useCallback(() => {
    setPlaying(false);
    setElapsed(clock.current.elapsed);
  }, []);
  const play = useCallback((from: number) => {
    clock.current = { started: performance.now(), elapsed: from };
    setElapsed(from);
    setPlaying(true);
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    setSingleShot(undefined);
    setElapsed(0);
    clock.current = { started: 0, elapsed: 0 };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new run/revision must reset playback.
  useEffect(() => {
    reset();
  }, [scope, reset]);
  useEffect(() => {
    if (!playing) return;
    const startElapsed = clock.current.elapsed;
    const timer = setInterval(() => {
      const next = Math.min(
        end,
        startElapsed + (performance.now() - clock.current.started) / 1000,
      );
      clock.current.elapsed = next;
      setElapsed(next);
      if (next >= end) setPlaying(false);
    }, 100);
    return () => clearInterval(timer);
  }, [playing, end]);
  useEffect(() => {
    if (!playable) pause();
  }, [playable, pause]);

  return (
    <section
      aria-label="Storyboard animatic"
      className="space-y-3 border-y border-border py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Animatic</h2>
          <p className="text-xs text-muted-foreground">
            Stills and dialogue preview · no generation credits
          </p>
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {timecode(elapsed)} / {timecode(total)}
        </span>
      </div>
      <Button
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border"
        ariaLabel={playing ? 'Pause animatic' : 'Play animatic'}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        isDisabled={!playable && !singleShot}
        onClick={() => {
          if (playing) pause();
          else
            play(
              elapsed >= end
                ? singleShot
                  ? (ranges.find((range) => range.shot.id === singleShot)
                      ?.start ?? 0)
                  : 0
                : elapsed,
            );
        }}
      >
        {current?.shot.stillUrl ? (
          <NextImage
            src={current.shot.stillUrl}
            alt={`Shot ${current.shot.ordinal}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Still preview unavailable
          </p>
        )}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {current ? `Shot ${current.shot.ordinal}` : 'No shots'}
        {current
          ? ` · ${timecode(current.start)}–${timecode(current.end)}`
          : ''}
      </p>
      <p className="whitespace-pre-wrap break-words text-sm">
        {current?.shot.dialogue || 'No dialogue'}
      </p>
      {!playable ? (
        <p className="text-xs text-muted-foreground">
          Every shot needs a still and duration to preview the full storyboard.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={
            playing ? <Pause className="size-4" /> : <Play className="size-4" />
          }
          label={
            playing
              ? 'Pause'
              : singleShot && !playable
                ? `Play shot ${current?.shot.ordinal}`
                : 'Play storyboard'
          }
          isDisabled={!playable && !singleShot}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            if (playing) {
              pause();
              return;
            }
            if (!playable && singleShot) {
              play(
                elapsed >= end
                  ? (ranges.find((range) => range.shot.id === singleShot)
                      ?.start ?? 0)
                  : elapsed,
              );
            } else {
              setSingleShot(undefined);
              play(elapsed >= total || singleShot ? 0 : elapsed);
            }
          }}
        />
        <Button
          icon={<RotateCcw className="size-4" />}
          label="Restart"
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          isDisabled={!shots.length}
          onClick={reset}
        />
        {ranges.map((range) => (
          <Button
            key={range.shot.id}
            label={`Play shot ${range.shot.ordinal}`}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            isDisabled={!range.shot.stillUrl || !range.shot.durationSeconds}
            onClick={() => {
              setSingleShot(range.shot.id);
              play(range.start);
            }}
          />
        ))}
      </div>
    </section>
  );
}
