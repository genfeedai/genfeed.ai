import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import AgentOutputShell from '@ui/layout/agent-output-layout/AgentOutputShell';
import { useTranslations } from 'next-intl';
import type { EditorLayoutProps } from '@/props/studio/editor-layout.props';
import EditorInspector from './EditorInspector';
import EditorLockedBanner from './EditorLockedBanner';
import EditorOutputPane from './EditorOutputPane';
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
  const translate = useTranslations('pages.studioEditor');

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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AgentOutputShell mode="rail">
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
        </AgentOutputShell>
      </div>

      {/* A clip the operator picks opens its inspector in the output pane's
          Context tab (or the right rail off the split layout); with nothing
          picked it stays a tab away so Add text is still reachable. */}
      <ContextSidebarPanel
        selection={{
          id: selectedClipId ?? project.id,
          kind: 'record',
          origin: selectedClipId ? 'user' : 'automatic',
          title: translate('inspector'),
        }}
      >
        <EditorInspector
          project={project}
          isReadOnly={isReadOnly}
          selectedTrackId={selectedTrackId}
          selectedClipId={selectedClipId}
          onAddTextTrack={onAddTextTrack}
          onTrackUpdate={onTrackUpdate}
          onClipSelect={onClipSelect}
        />
      </ContextSidebarPanel>
    </div>
  );
}
