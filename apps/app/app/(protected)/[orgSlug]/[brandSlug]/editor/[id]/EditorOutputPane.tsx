import type { EditorOutputPaneProps } from '@/features/studio/props/editor-output-pane.props';
import EditorPreview from './EditorPreview';
import EditorTimeline from './EditorTimeline';

export default function EditorOutputPane({
  project,
  previewRef,
  currentFrame,
  zoom,
  isReadOnly,
  selectedClipId,
  onSeek,
  onTrackUpdate,
  onClipMove,
  onClipResize,
  onClipSelect,
  onFrameChange,
  onPlayingChange,
}: EditorOutputPaneProps) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 p-4 bg-muted/20">
        <div className="h-full flex items-center justify-center">
          <div className="w-full max-w-4xl">
            <EditorPreview
              ref={previewRef}
              backgroundColor={project.settings.backgroundColor}
              tracks={project.tracks}
              width={project.settings.width}
              height={project.settings.height}
              fps={project.settings.fps}
              totalFrames={project.totalDurationFrames}
              onFrameChange={onFrameChange}
              onPlayingChange={onPlayingChange}
            />
          </div>
        </div>
      </div>

      <div className="h-64 shrink-0 border-t border-border overflow-hidden">
        <EditorTimeline
          tracks={project.tracks}
          currentFrame={currentFrame}
          totalFrames={project.totalDurationFrames}
          fps={project.settings.fps}
          zoom={zoom}
          isReadOnly={isReadOnly}
          onSeek={onSeek}
          onTrackUpdate={onTrackUpdate}
          onClipMove={onClipMove}
          onClipResize={onClipResize}
          onClipSelect={onClipSelect}
          selectedClipId={selectedClipId}
        />
      </div>
    </div>
  );
}
