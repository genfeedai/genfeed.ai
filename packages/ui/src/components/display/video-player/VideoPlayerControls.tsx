import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { formatDuration } from '@genfeedai/helpers/video-duration.helper';
import type { VideoPlayerControlsProps } from '@genfeedai/props/studio/video-player.props';
import { Button } from '@genfeedai/ui/primitives/button';
import { Slider } from '@genfeedai/ui/primitives/slider';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';

export default function VideoPlayerControls({
  videoRef,
  isPlaying,
  isMuted,
  currentTime,
  duration,
  onPlaybackError,
}: VideoPlayerControlsProps) {
  return (
    <div
      className="nodrag nopan absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-1 bg-background/90 p-1 text-foreground"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      role="group"
      aria-label="Video controls"
    >
      <Button
        ariaLabel={isPlaying ? 'Pause video' : 'Play video'}
        className="size-7"
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) video.play().catch(onPlaybackError);
          else video.pause();
        }}
      >
        {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
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
      <span className="flex-1 whitespace-nowrap text-2xs tabular-nums">
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
          if (document.fullscreenElement) void document.exitFullscreen?.();
          else void videoRef.current?.parentElement?.requestFullscreen?.();
        }}
      >
        <Maximize className="size-4" />
      </Button>
    </div>
  );
}
