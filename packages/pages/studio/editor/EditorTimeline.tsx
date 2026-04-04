'use client';

import type { IEditorClip, IEditorTrack } from '@genfeedai/interfaces';
import { ButtonSize, ButtonVariant, EditorTrackType } from '@genfeedai/enums';
import type { EditorTimelineProps } from '@props/studio/editor-timeline.props';
import Button from '@ui/buttons/base/Button';
import { useCallback, useRef, useState } from 'react';

function formatTime(frames: number, fps: number): string {
  const totalSeconds = frames / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frameNum = Math.floor(frames % fps);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameNum.toString().padStart(2, '0')}`;
}

function TimeRuler({
  totalFrames,
  fps,
  zoom,
}: {
  totalFrames: number;
  fps: number;
  zoom: number;
}) {
  const markers: { frame: number; label: string; major: boolean }[] = [];

  // Calculate marker interval based on zoom level
  const secondFrames = fps;
  const interval =
    zoom > 2 ? secondFrames : zoom > 0.5 ? secondFrames * 5 : secondFrames * 10;

  for (let frame = 0; frame <= totalFrames; frame += interval) {
    markers.push({
      frame,
      label: formatTime(frame, fps),
      major: frame % (secondFrames * 5) === 0,
    });
  }

  return (
    <div
      className="relative h-6 border-b border-white/[0.08] bg-muted/50"
      style={{ width: `${totalFrames * zoom}px` }}
    >
      {markers.map((marker) => (
        <div
          key={marker.frame}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: `${marker.frame * zoom}px` }}
        >
          <div
            className={`w-px ${marker.major ? 'h-4 bg-foreground/60' : 'h-2 bg-foreground/30'}`}
          />
          {marker.major && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {marker.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface TrackRowProps {
  track: IEditorTrack;
  zoom: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string) => void;
  onClipMove: (clipId: string, newStartFrame: number) => void;
  onClipResize: (
    clipId: string,
    newDuration: number,
    fromStart: boolean,
  ) => void;
}

function TrackRow({
  track,
  zoom,
  selectedClipId,
  onClipSelect,
  onClipMove,
  onClipResize,
}: TrackRowProps) {
  const trackLabel =
    track.type === EditorTrackType.VIDEO
      ? 'Video'
      : track.type === EditorTrackType.AUDIO
        ? 'Audio'
        : 'Text';

  return (
    <div className="flex border-b border-white/[0.08]">
      {/* Track header */}
      <div className="flex w-48 shrink-0 items-center gap-2 border-r border-white/[0.08] bg-card px-3 py-2">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-foreground/60">
          {trackLabel}
        </span>
        <span className="truncate text-sm font-medium">{track.name}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            tooltip={track.isMuted ? 'Unmute' : 'Mute'}
            className={
              track.isMuted ? 'bg-destructive/20 text-destructive' : ''
            }
          >
            {track.isMuted ? 'Muted' : 'Mute'}
          </Button>
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            tooltip={track.isLocked ? 'Unlock' : 'Lock'}
            className={track.isLocked ? 'bg-warning/20 text-warning' : ''}
          >
            {track.isLocked ? 'Locked' : 'Lock'}
          </Button>
        </div>
      </div>

      {/* Track content area */}
      <div className="relative h-16 flex-1 bg-muted/20">
        {track.clips.map((clip) => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            trackType={track.type}
            zoom={zoom}
            isSelected={selectedClipId === clip.id}
            isLocked={track.isLocked}
            onSelect={() => onClipSelect(clip.id)}
            onMove={(newFrame) => onClipMove(clip.id, newFrame)}
            onResize={(newDuration, fromStart) =>
              onClipResize(clip.id, newDuration, fromStart)
            }
          />
        ))}
      </div>
    </div>
  );
}

interface ClipBlockProps {
  clip: IEditorClip;
  trackType: EditorTrackType;
  zoom: number;
  isSelected: boolean;
  isLocked: boolean;
  onSelect: () => void;
  onMove: (newStartFrame: number) => void;
  onResize: (newDuration: number, fromStart: boolean) => void;
}

function ClipBlock({
  clip,
  trackType,
  zoom,
  isSelected,
  isLocked,
  onSelect,
  onMove,
  onResize,
}: ClipBlockProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'start' | 'end' | null>(null);
  const dragStartRef = useRef({ duration: 0, startFrame: 0, x: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, type: 'move' | 'resize-start' | 'resize-end') => {
      if (isLocked) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      onSelect();

      dragStartRef.current = {
        duration: clip.durationFrames,
        startFrame: clip.startFrame,
        x: e.clientX,
      };

      if (type === 'move') {
        setIsDragging(true);
      } else {
        setIsResizing(type === 'resize-start' ? 'start' : 'end');
      }

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaFrames = Math.round(deltaX / zoom);

        if (type === 'move') {
          const newStart = Math.max(
            0,
            dragStartRef.current.startFrame + deltaFrames,
          );
          onMove(newStart);
        } else if (type === 'resize-start') {
          const newDuration = Math.max(
            1,
            dragStartRef.current.duration - deltaFrames,
          );
          onResize(newDuration, true);
        } else {
          const newDuration = Math.max(
            1,
            dragStartRef.current.duration + deltaFrames,
          );
          onResize(newDuration, false);
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        setIsResizing(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      clip.startFrame,
      clip.durationFrames,
      zoom,
      isLocked,
      onSelect,
      onMove,
      onResize,
    ],
  );

  const bgColor =
    trackType === EditorTrackType.VIDEO
      ? 'bg-blue-500/80'
      : trackType === EditorTrackType.AUDIO
        ? 'bg-green-500/80'
        : 'bg-purple-500/80';

  return (
    <div
      ref={clipRef}
      className={`absolute top-1 bottom-1 ${bgColor} ${
        isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
      } ${isDragging || isResizing ? 'opacity-80' : ''} ${
        isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-move'
      }`}
      style={{
        left: `${clip.startFrame * zoom}px`,
        minWidth: '20px',
        width: `${clip.durationFrames * zoom}px`,
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Resize handles */}
      {!isLocked && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
            onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20"
            onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
          />
        </>
      )}

      {/* Clip thumbnail/preview */}
      {clip.thumbnailUrl && clip.durationFrames * zoom > 40 && (
        <div
          className="absolute left-2 top-1 bottom-1 w-10 bg-cover bg-center"
          style={{ backgroundImage: `url(${clip.thumbnailUrl})` }}
        />
      )}

      {/* Clip label */}
      {clip.durationFrames * zoom > 60 && (
        <span className="absolute left-14 top-1/2 -translate-y-1/2 truncate text-xs text-white font-medium px-1">
          {clip.textOverlay?.text || 'Clip'}
        </span>
      )}
    </div>
  );
}

export function EditorTimeline({
  tracks,
  currentFrame,
  totalFrames,
  fps,
  zoom,
  onSeek,
  onTrackUpdate,
  onClipMove,
  onClipResize,
  onClipSelect,
  selectedClipId,
}: EditorTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [_isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + containerRef.current.scrollLeft - 192; // 192 = track header width
      const frame = Math.max(0, Math.min(totalFrames, Math.round(x / zoom)));
      onSeek(frame);
    },
    [totalFrames, zoom, onSeek],
  );

  const handlePlayheadDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingPlayhead(true);

      const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) {
          return;
        }
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + containerRef.current.scrollLeft - 192;
        const frame = Math.max(0, Math.min(totalFrames, Math.round(x / zoom)));
        onSeek(frame);
      };

      const handleMouseUp = () => {
        setIsDraggingPlayhead(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [totalFrames, zoom, onSeek],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col overflow-auto border border-white/[0.08] bg-background"
    >
      {/* Time ruler row */}
      <div className="flex sticky top-0 z-20 bg-background">
        <div className="w-48 shrink-0 border-r border-b border-white/[0.08] bg-card px-3 py-1">
          <span className="text-xs text-muted-foreground">
            {formatTime(currentFrame, fps)}
          </span>
        </div>
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="flex-1 relative text-left"
          onClick={handleTimelineClick}
          aria-label="Timeline ruler - click to seek"
        >
          <TimeRuler totalFrames={totalFrames} fps={fps} zoom={zoom} />
        </Button>
      </div>

      {/* Tracks */}
      <div className="relative">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            zoom={zoom}
            selectedClipId={selectedClipId}
            onClipSelect={(clipId) => onClipSelect(track.id, clipId)}
            onClipMove={(clipId, frame) => onClipMove(track.id, clipId, frame)}
            onClipResize={(clipId, duration, fromStart) =>
              onClipResize(track.id, clipId, duration, fromStart)
            }
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 cursor-ew-resize"
          style={{ left: `${192 + currentFrame * zoom}px` }}
          onMouseDown={handlePlayheadDrag}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
        </div>
      </div>

      {/* Empty state */}
      {tracks.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          No tracks. Add a video or audio track to get started.
        </div>
      )}
    </div>
  );
}

export default EditorTimeline;
