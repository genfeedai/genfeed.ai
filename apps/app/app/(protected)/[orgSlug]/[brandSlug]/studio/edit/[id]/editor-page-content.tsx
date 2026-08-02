'use client';

import EditorLayout from './EditorLayout';
import EditorLoadingState from './EditorLoadingState';
import EditorNotFound from './EditorNotFound';
import { useEditorPageContent } from './useEditorPageContent';

interface EditorPageContentProps {
  projectId: string;
}

export default function EditorPageContent({
  projectId,
}: EditorPageContentProps) {
  const {
    state,
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
