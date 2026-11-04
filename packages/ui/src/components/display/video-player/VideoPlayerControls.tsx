import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import type { VideoPlayerControlsProps } from '@genfeedai/props/studio/video-player.props';
import { Button } from '@genfeedai/ui/primitives/button';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';

/**
 * Transport for the shared video player, drawn like the shared audio
 * `MediaPlayer`: a round play button, a thin seek line, and `m:ss / m:ss`
 * time. While paused the play button sits centred on the poster; while
 * playing it gives way to the footer, where the same button pauses.
 */
export default function VideoPlayerControls({
  videoRef,
  isPlaying,
  isMuted,
  currentTime,
  duration,
  onPlaybackError,
}: VideoPlayerControlsProps) {
  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused)
      video.play().catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'name' in error &&
          error.name === 'AbortError'
        )
          return;
        onPlaybackError(error);
      });
    else video.pause();
  };

  const playLabel = isPlaying ? 'Pause video' : 'Play video';

  return (
    <>
      {isPlaying ? null : (
        // Sized to the button, not the poster, so the video's own click still works.
        // Centred in the space above the footer so short players keep it clickable.
        <div className="nodrag nopan absolute top-[calc((100%-2.5rem)/2)] left-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <Button
            ariaLabel={playLabel}
            className="size-10 shrink-0 rounded-full"
            size={ButtonSize.ICON}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            onClick={(event) => {
              // Keep the click off any card or slide wrapped around the player.
              event.stopPropagation();
              toggle();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Play aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}
      <div
        className="nodrag nopan absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-1 bg-background/90 p-1 text-foreground"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        role="group"
        aria-label="Video controls"
      >
        {isPlaying ? (
          <Button
            ariaLabel={playLabel}
            className="size-8 shrink-0 rounded-full"
            size={ButtonSize.ICON}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
            onClick={toggle}
          >
            <Pause aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
        <Slider
          aria-label="Seek video"
          min={0}
          max={duration || 1}
          step={0.1}
          value={[Math.min(currentTime, duration || 0)]}
          disabled={!duration}
          className="order-first w-full basis-full"
          onValueChange={([time]) => {
            if (videoRef.current && time !== undefined)
              videoRef.current.currentTime = time;
          }}
        />
        <span className="flex-1 whitespace-nowrap text-2xs tabular-nums text-muted-foreground">
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
        <Button
          ariaLabel={isMuted ? 'Unmute video' : 'Mute video'}
          className="size-7"
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          onClick={() => {
            if (videoRef.current)
              videoRef.current.muted = !videoRef.current.muted;
          }}
        >
          {isMuted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </Button>
        <Button
          ariaLabel="Toggle fullscreen"
          className="size-7"
          size={ButtonSize.ICON}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          onClick={() => {
            const container = videoRef.current?.parentElement;
            const request =
              document.fullscreenElement === container
                ? document.exitFullscreen?.()
                : container?.requestFullscreen?.();
            request?.catch(() => undefined);
          }}
        >
          <Maximize className="size-4" />
        </Button>
      </div>
    </>
  );
}
