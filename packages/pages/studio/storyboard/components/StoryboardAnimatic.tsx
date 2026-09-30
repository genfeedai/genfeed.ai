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
  const mediaKey = JSON.stringify([
    scope,
    shots.map((shot) => [shot.id, shot.stillUrl]),
  ]);
  const activeMediaKey = useRef(mediaKey);
  activeMediaKey.current = mediaKey;
  const attempts = useRef(
    new Map<string, { image: HTMLImageElement; cancelled: boolean }>(),
  );
  const [media, setMedia] = useState<{
    key: string;
    states: Record<string, 'loading' | 'loaded' | 'failed'>;
  }>({ key: mediaKey, states: {} });
  const startAttempt = useCallback(
    (shotId: string, url: string) => {
      const previous = attempts.current.get(shotId);
      if (previous) {
        previous.cancelled = true;
        previous.image.onload = null;
        previous.image.onerror = null;
      }
      const image = new window.Image();
      const entry = { image, cancelled: false };
      attempts.current.set(shotId, entry);
      const publish = (status: 'loading' | 'loaded' | 'failed') => {
        if (
          entry.cancelled ||
          activeMediaKey.current !== mediaKey ||
          attempts.current.get(shotId) !== entry
        )
          return;
        setMedia((current) => ({
          key: mediaKey,
          states: {
            ...(current.key === mediaKey ? current.states : {}),
            [shotId]: status,
          },
        }));
      };
      image.onerror = () => publish('failed');
      image.onload = () => {
        const decoded =
          typeof image.decode === 'function'
            ? image.decode()
            : Promise.resolve();
        void decoded
          .then(() =>
            publish(
              image.naturalWidth > 0 && image.naturalHeight > 0
                ? 'loaded'
                : 'failed',
            ),
          )
          .catch(() => publish('failed'));
      };
      publish('loading');
      image.src = url;
      if (image.complete && image.naturalWidth > 0)
        image.onload(new Event('load'));
    },
    [mediaKey],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: mediaKey captures the complete scope/shot/URL attempt identity.
  useEffect(() => {
    setMedia({ key: mediaKey, states: {} });
    for (const shot of shots)
      if (shot.stillUrl) startAttempt(shot.id, shot.stillUrl);
    const currentAttempts = attempts.current;
    return () => {
      for (const attempt of currentAttempts.values()) {
        attempt.cancelled = true;
        attempt.image.onload = null;
        attempt.image.onerror = null;
      }
      currentAttempts.clear();
    };
  }, [mediaKey, startAttempt]);
  const mediaStatus = (id: string) =>
    media.key === mediaKey ? media.states[id] : undefined;
  const ready = (shot: StoryboardAnimaticProps['shots'][number]) =>
    shot.durationSeconds !== null &&
    Number.isFinite(shot.durationSeconds) &&
    shot.durationSeconds > 0 &&
    mediaStatus(shot.id) === 'loaded';
  const playable = shots.length > 0 && shots.every(ready);
  const singleReady = Boolean(
    singleShot && shots.some((shot) => shot.id === singleShot && ready(shot)),
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
    if (playing && !(singleShot ? singleReady : playable)) pause();
  }, [playing, singleShot, singleReady, playable, pause]);

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
        isDisabled={!playable && !singleReady}
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
        {current?.shot.stillUrl && mediaStatus(current.shot.id) === 'loaded' ? (
          <NextImage
            src={current.shot.stillUrl}
            alt={`Shot ${current.shot.ordinal}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-contain"
            onError={() => {
              if (activeMediaKey.current !== mediaKey) return;
              const attempt = attempts.current.get(current.shot.id);
              if (attempt) attempt.cancelled = true;
              setMedia((value) => ({
                key: mediaKey,
                states: {
                  ...(value.key === mediaKey ? value.states : {}),
                  [current.shot.id]: 'failed',
                },
              }));
              pause();
            }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            {current?.shot.stillUrl && mediaStatus(current.shot.id) !== 'failed'
              ? 'Loading still preview'
              : 'Still preview unavailable'}
          </p>
        )}
      </Button>
      {current?.shot.stillUrl && mediaStatus(current.shot.id) === 'failed' ? (
        <Button
          label="Retry still preview"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() => {
            if (current.shot.stillUrl)
              startAttempt(current.shot.id, current.shot.stillUrl);
          }}
        />
      ) : null}
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
          isDisabled={!playable && !singleReady}
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
            isDisabled={!ready(range.shot)}
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
