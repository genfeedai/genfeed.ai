import type { IngredientFormat } from '@genfeedai/enums';
import type { IEditorProject, IEditorTrack } from '@genfeedai/interfaces';
import type { RefObject } from 'react';
import EditorEffectsPanel from './EditorEffectsPanel';
import EditorPreview, { type EditorPreviewRef } from './EditorPreview';
import EditorPropertiesPanel from './EditorPropertiesPanel';
import EditorTextPanel from './EditorTextPanel';
import EditorTimeline from './EditorTimeline';
import EditorToolbar from './EditorToolbar';

type Props = {
  project: IEditorProject;
  previewRef: RefObject<EditorPreviewRef | null>;
  isPlaying: boolean;
  currentFrame: number;
  zoom: number;
  isDirty: boolean;
  isRendering: boolean;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onPlayPause: () => void;
  onSeek: (frame: number) => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onZoomChange: (zoom: number) => void;
  onFormatChange: (format: IngredientFormat) => void;
  onAddVideoTrack: () => void;
  onAddAudioTrack: () => void;
  onSave: () => void;
  onRender: () => void;
  onBack: () => void;
  onAddTextTrack: (newTrack: IEditorTrack) => void;
  onTrackUpdate: (trackId: string, trackUpdates: Partial<IEditorTrack>) => void;
  onClipMove: (trackId: string, clipId: string, newStartFrame: number) => void;
  onClipResize: (
    trackId: string,
    clipId: string,
    newDuration: number,
    fromStart: boolean,
  ) => void;
  onClipSelect: (trackId: string, clipId: string) => void;
  onFrameChange: (frame: number) => void;
  onPlayingChange: (isPlaying: boolean) => void;
};

export default function EditorLayout({
  project,
  previewRef,
  isPlaying,
  currentFrame,
  zoom,
  isDirty,
  isRendering,
  selectedTrackId,
  selectedClipId,
  onPlayPause,
  onSeek,
  onSeekStart,
  onSeekEnd,
  onStepBack,
  onStepForward,
  onZoomChange,
  onFormatChange,
  onAddVideoTrack,
  onAddAudioTrack,
  onSave,
  onRender,
  onBack,
  onAddTextTrack,
  onTrackUpdate,
  onClipMove,
  onClipResize,
  onClipSelect,
  onFrameChange,
  onPlayingChange,
}: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <EditorToolbar
        projectName={project.name}
        format={project.settings.format}
        isPlaying={isPlaying}
        currentFrame={currentFrame}
        totalFrames={project.totalDurationFrames}
        fps={project.settings.fps}
        zoom={zoom}
        isDirty={isDirty}
        isRendering={isRendering}
        onPlayPause={onPlayPause}
        onSeekStart={onSeekStart}
        onSeekEnd={onSeekEnd}
        onStepBack={onStepBack}
        onStepForward={onStepForward}
        onZoomChange={onZoomChange}
        onFormatChange={onFormatChange}
        onAddVideoTrack={onAddVideoTrack}
        onAddAudioTrack={onAddAudioTrack}
        onSave={onSave}
        onRender={onRender}
        onBack={onBack}
      />

      {/* Main content area — three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Text overlays */}
        <div className="w-60 shrink-0 overflow-y-auto">
          <EditorTextPanel
            tracks={project.tracks}
            fps={project.settings.fps}
            totalFrames={project.totalDurationFrames}
            selectedTrackId={selectedTrackId}
            selectedClipId={selectedClipId}
            onAddTextTrack={onAddTextTrack}
            onTrackUpdate={onTrackUpdate}
            onClipSelect={onClipSelect}
          />
        </div>

        {/* Center — Preview + Timeline */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Preview area */}
          <div className="flex-1 p-4 bg-muted/30">
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

          {/* Timeline area */}
          <div className="h-64 shrink-0 border-t border-white/[0.08] overflow-hidden">
            <EditorTimeline
              tracks={project.tracks}
              currentFrame={currentFrame}
              totalFrames={project.totalDurationFrames}
              fps={project.settings.fps}
              zoom={zoom}
              onSeek={onSeek}
              onTrackUpdate={onTrackUpdate}
              onClipMove={onClipMove}
              onClipResize={onClipResize}
              onClipSelect={onClipSelect}
              selectedClipId={selectedClipId}
            />
          </div>
        </div>

        {/* Right panel — Effects & Properties */}
        <div className="w-64 shrink-0 overflow-y-auto flex flex-col">
          <EditorEffectsPanel
            tracks={project.tracks}
            selectedTrackId={selectedTrackId}
            selectedClipId={selectedClipId}
            onTrackUpdate={onTrackUpdate}
          />
          <div className="border-t border-white/[0.08]">
            <EditorPropertiesPanel
              tracks={project.tracks}
              fps={project.settings.fps}
              selectedTrackId={selectedTrackId}
              selectedClipId={selectedClipId}
              onTrackUpdate={onTrackUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
