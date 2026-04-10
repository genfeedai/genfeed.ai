'use client';

import { AlertCategory, ComponentSize } from '@genfeedai/enums';
import type { VideoTrimTimelineProps } from '@genfeedai/props/ui/media/video-trim-timeline.props';
import Alert from '@ui/feedback/alert/Alert';
import Spinner from '@ui/feedback/spinner/Spinner';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';
import { useMemo } from 'react';

/**
 * Format time in MM:SS format
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function VideoTrimTimeline({
  videoDuration,
  startTime,
  endTime,
  thumbnails,
  isGeneratingThumbnails,
  onRangeChange,
}: VideoTrimTimelineProps) {
  // Calculate trim duration
  const trimDuration = endTime - startTime;

  // Generate marks for the timeline
  const marks = useMemo(() => {
    const marksObj: Record<number, string> = {};
    const intervals = 5; // Show 5 time markers

    for (let i = 0; i <= intervals; i++) {
      const time = (videoDuration / intervals) * i;
      marksObj[time] = formatTime(time);
    }

    return marksObj;
  }, [videoDuration]);

  return (
    <div className="w-full space-y-4">
      {/* Thumbnails Strip */}
      <div className="relative w-full h-20 overflow-hidden bg-muted">
        {isGeneratingThumbnails ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size={ComponentSize.SM} />
            <span className="ml-2 text-sm">Generating timeline...</span>
          </div>
        ) : thumbnails.length > 0 ? (
          <div className="flex h-full">
            {thumbnails.map((thumbnail, index) => (
              <div
                key={index}
                className="flex-1 h-full bg-cover bg-center border-r border-white/[0.08] last:border-r-0"
                style={{
                  backgroundImage: `url(${thumbnail.dataUrl})`,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-foreground/60">
            No thumbnails available
          </div>
        )}

        {/* Overlay showing selected range */}
        <div
          className="absolute top-0 bottom-0 bg-primary/20 border-l-2 border-r-2 border-primary pointer-events-none"
          style={{
            left: `${(startTime / videoDuration) * 100}%`,
            right: `${((videoDuration - endTime) / videoDuration) * 100}%`,
          }}
        />
      </div>

      {/* Range Slider */}
      <div className="px-2">
        <Slider
          range
          min={0}
          max={videoDuration}
          step={0.1}
          value={[startTime, endTime]}
          onChange={(values) => onRangeChange(values as [number, number])}
          marks={marks}
          className="custom-range-slider"
          styles={{
            handle: {
              backgroundColor: 'hsl(var(--p))',
              borderColor: 'hsl(var(--p))',
              height: 16,
              marginTop: -4,
              opacity: 1,
              width: 16,
            },
            rail: {
              background: 'rgba(255, 255, 255, 0.1)',
              height: 8,
            },
            track: {
              background:
                'linear-gradient(90deg, hsl(var(--p)) 0%, hsl(var(--s)) 100%)',
              height: 8,
            },
          }}
        />
      </div>

      {/* Time Display */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-foreground/60">Start:</span>
            <span className="ml-2 font-mono font-semibold">
              {formatTime(startTime)}
            </span>
          </div>
          <div>
            <span className="text-foreground/60">End:</span>
            <span className="ml-2 font-mono font-semibold">
              {formatTime(endTime)}
            </span>
          </div>
        </div>
        <div>
          <span className="text-foreground/60">Duration:</span>
          <span
            className={`ml-2 font-mono font-semibold ${
              trimDuration < 2 || trimDuration > 15
                ? 'text-error'
                : 'text-success'
            }`}
          >
            {formatTime(trimDuration)}
          </span>
        </div>
      </div>

      {/* Validation Message */}
      {(trimDuration < 2 || trimDuration > 15) && (
        <Alert type={AlertCategory.WARNING} className="text-sm">
          Clip duration must be between 2 and 15 seconds
        </Alert>
      )}

      {/* Instructions */}
      <div className="text-xs text-foreground/60 text-center">
        Drag the handles to select a 2-15 second clip
      </div>
    </div>
  );
}
