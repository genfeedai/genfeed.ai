'use client';

import { useMemo } from 'react';
import type { EditorPageContentProps } from '@/features/studio/props/editor-page-content.props';
import { useCreativeAppAgentContext } from '@/hooks/agent/use-creative-app-agent-context/use-creative-app-agent-context';
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
    canUndo,
    canRedo,
    handleUndo,
    handleRedo,
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

  // With a project open, change requests belong to it; the agent only needs
  // to know which one that is.
  const projectName = state.project?.name ?? '';
  const creativeApp = useMemo(
    () =>
      state.project
        ? {
            app: 'editor' as const,
            openProjectId: projectId,
            projects: [{ id: projectId, title: projectName }],
          }
        : null,
    [projectId, projectName, state.project],
  );
  useCreativeAppAgentContext(creativeApp);

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
      saveStatus={state.saveStatus}
      canUndo={canUndo}
      canRedo={canRedo}
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
      onUndo={handleUndo}
      onRedo={handleRedo}
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
