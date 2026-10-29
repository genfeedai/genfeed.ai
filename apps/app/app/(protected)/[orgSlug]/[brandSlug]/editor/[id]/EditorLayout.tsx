import type { EditorLayoutProps } from '@props/studio/editor-layout.props';
import EditorEffectsPanel from './EditorEffectsPanel';
import EditorLockedBanner from './EditorLockedBanner';
import EditorOutputPane from './EditorOutputPane';
import EditorPropertiesPanel from './EditorPropertiesPanel';
import EditorTextPanel from './EditorTextPanel';
import EditorToolbar from './EditorToolbar';

export default function EditorLayout({
  project,
  previewRef,
  isPlaying,
  currentFrame,
  zoom,
  isDirty,
  saveStatus,
  canUndo,
  canRedo,
  isRendering,
  isReadOnly,
  hasSaveConflict,
  isDuplicating,
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
  onUndo,
  onRedo,
  onRender,
  onBack,
  onDuplicate,
  onAddTextTrack,
  onTrackUpdate,
  onClipMove,
  onClipResize,
  onClipSelect,
  onFrameChange,
  onPlayingChange,
}: EditorLayoutProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <EditorToolbar
        projectName={project.name}
        format={project.settings.format}
        isPlaying={isPlaying}
        currentFrame={currentFrame}
        totalFrames={project.totalDurationFrames}
        fps={project.settings.fps}
        zoom={zoom}
        isDirty={isDirty}
        saveStatus={saveStatus}
        canUndo={canUndo}
        canRedo={canRedo}
        isRendering={isRendering}
        isReadOnly={isReadOnly}
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
        onUndo={onUndo}
        onRedo={onRedo}
        onRender={onRender}
        onBack={onBack}
      />

      {isReadOnly && (
        <EditorLockedBanner
          hasSaveConflict={hasSaveConflict}
          isDuplicating={isDuplicating}
          onDuplicate={onDuplicate}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-60 shrink-0 overflow-y-auto">
          <EditorTextPanel
            tracks={project.tracks}
            fps={project.settings.fps}
            totalFrames={project.totalDurationFrames}
            isReadOnly={isReadOnly}
            selectedTrackId={selectedTrackId}
            selectedClipId={selectedClipId}
            onAddTextTrack={onAddTextTrack}
            onTrackUpdate={onTrackUpdate}
            onClipSelect={onClipSelect}
          />
        </div>

        <EditorOutputPane
          project={project}
          previewRef={previewRef}
          currentFrame={currentFrame}
          zoom={zoom}
          isReadOnly={isReadOnly}
          selectedClipId={selectedClipId}
          onSeek={onSeek}
          onTrackUpdate={onTrackUpdate}
          onClipMove={onClipMove}
          onClipResize={onClipResize}
          onClipSelect={onClipSelect}
          onFrameChange={onFrameChange}
          onPlayingChange={onPlayingChange}
        />

        <div className="w-64 shrink-0 overflow-y-auto flex flex-col">
          <EditorEffectsPanel
            tracks={project.tracks}
            isReadOnly={isReadOnly}
            selectedTrackId={selectedTrackId}
            selectedClipId={selectedClipId}
            onTrackUpdate={onTrackUpdate}
          />
          <div className="border-t border-border">
            <EditorPropertiesPanel
              tracks={project.tracks}
              fps={project.settings.fps}
              isReadOnly={isReadOnly}
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
