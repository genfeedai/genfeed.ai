'use client';

import type { EditorPageContentProps } from '@props/studio/editor-page-content.props';
import EditorLayout from './EditorLayout';
import EditorLoadingState from './EditorLoadingState';
import EditorNotFound from './EditorNotFound';
import { useEditorPageContent } from './useEditorPageContent';

export default function EditorPageContent({
  projectId,
}: EditorPageContentProps) {
  const {
    state,
    isReadOnly,
    previewRef,
    handlePlayPause,
    handleSeek,
    handleSeekStart,
    handleSeekEnd,
    handleStepBack,
    handleStepForward,
    handleZoomChange,
    handleFormatChange,
    handleAddVideoTrack,
    handleAddAudioTrack,
    handleAddTextTrack,
    handleTrackUpdate,
    handleClipMove,
    handleClipResize,
    handleClipSelect,
    handleSave,
    handleRender,
    handleDuplicate,
    handleBack,
    handleFrameChange,
    handlePlayingChange,
  } = useEditorPageContent(projectId);

  if (state.isLoading) {
    return <EditorLoadingState />;
  }

  if (!state.project) {
    return <EditorNotFound onBack={handleBack} />;
  }

  return (
    <EditorLayout
      project={state.project}
      previewRef={previewRef}
      isPlaying={state.isPlaying}
      currentFrame={state.currentFrame}
      zoom={state.zoom}
      isDirty={state.isDirty}
      isRendering={state.isRendering}
      isReadOnly={isReadOnly}
      hasSaveConflict={state.hasSaveConflict}
      isDuplicating={state.isDuplicating}
      selectedTrackId={state.selectedTrackId}
      selectedClipId={state.selectedClipId}
      onPlayPause={handlePlayPause}
      onSeek={handleSeek}
      onSeekStart={handleSeekStart}
      onSeekEnd={handleSeekEnd}
      onStepBack={handleStepBack}
      onStepForward={handleStepForward}
      onZoomChange={handleZoomChange}
      onFormatChange={handleFormatChange}
      onAddVideoTrack={handleAddVideoTrack}
      onAddAudioTrack={handleAddAudioTrack}
      onSave={handleSave}
      onRender={handleRender}
      onBack={handleBack}
      onDuplicate={handleDuplicate}
      onAddTextTrack={handleAddTextTrack}
      onTrackUpdate={handleTrackUpdate}
      onClipMove={handleClipMove}
      onClipResize={handleClipResize}
      onClipSelect={handleClipSelect}
      onFrameChange={handleFrameChange}
      onPlayingChange={handlePlayingChange}
    />
  );
}
