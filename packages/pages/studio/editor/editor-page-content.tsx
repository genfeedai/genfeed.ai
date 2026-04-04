'use client';

import type {
  IEditorProject,
  IEditorTrack,
  IIngredient,
} from '@cloud/interfaces';
import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EditorEffectsPanel } from '@pages/studio/editor/EditorEffectsPanel';
import {
  EditorPreview,
  type EditorPreviewRef,
} from '@pages/studio/editor/EditorPreview';
import { EditorPropertiesPanel } from '@pages/studio/editor/EditorPropertiesPanel';
import { EditorTextPanel } from '@pages/studio/editor/EditorTextPanel';
import { EditorTimeline } from '@pages/studio/editor/EditorTimeline';
import { EditorToolbar } from '@pages/studio/editor/EditorToolbar';
import {
  useConfirmModal,
  useGalleryModal,
} from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import Button from '@ui/buttons/base/Button';
import { track } from '@vercel/analytics';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_FPS = 30;
const AUTO_SAVE_INTERVAL = 30000;

interface EditorState {
  project: IEditorProject | null;
  isLoading: boolean;
  isDirty: boolean;
  lastSavedAt: Date | null;
  currentFrame: number;
  isPlaying: boolean;
  isRendering: boolean;
  zoom: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
}

const FORMAT_DIMENSIONS: Record<
  IngredientFormat,
  { width: number; height: number }
> = {
  [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
  [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
  [IngredientFormat.SQUARE]: { height: 1080, width: 1080 },
};

interface EditorPageContentProps {
  projectId: string;
}

export default function EditorPageContent({
  projectId,
}: EditorPageContentProps) {
  const brandId = useBrandId();
  const router = useRouter();
  const { href } = useOrgUrl();
  const { openGallery } = useGalleryModal();
  const { openConfirm } = useConfirmModal();
  const notificationsService = NotificationsService.getInstance();
  const previewRef = useRef<EditorPreviewRef>(null);

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );

  const [state, setState] = useState<EditorState>({
    currentFrame: 0,
    isDirty: false,
    isLoading: true,
    isPlaying: false,
    isRendering: false,
    lastSavedAt: null,
    project: null,
    selectedClipId: null,
    selectedTrackId: null,
    zoom: 2,
  });

  useEffect(() => {
    track('studio_editor_opened', { surface: 'canvas' });
  }, []);

  // Load existing project by ID
  useEffect(() => {
    const controller = new AbortController();

    const loadProject = async () => {
      try {
        const service = await getEditorService();
        const project = await service.findById(projectId);

        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            project: project ?? null,
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load project', error);
          notificationsService.error('Failed to load project');
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    loadProject();

    return () => controller.abort();
  }, [brandId, projectId, notificationsService, getEditorService]);

  // Auto-save effect
  useEffect(() => {
    if (!state.project || !state.isDirty) {
      return;
    }

    const project = state.project;
    const saveTimeout = setTimeout(async () => {
      try {
        const service = await getEditorService();
        await service.update(project.id, {
          name: project.name,
          settings: project.settings,
          totalDurationFrames: project.totalDurationFrames,
          tracks: project.tracks,
        });
        logger.info('Project auto-saved', { projectId: project.id });
        setState((prev) => ({
          ...prev,
          isDirty: false,
          lastSavedAt: new Date(),
        }));
        notificationsService.success('Project auto-saved');
      } catch (error) {
        logger.error('Failed to auto-save project', error);
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearTimeout(saveTimeout);
  }, [state.project, state.isDirty, notificationsService, getEditorService]);

  const updateProject = useCallback((updates: Partial<IEditorProject>) => {
    setState((prev) => ({
      ...prev,
      isDirty: true,
      project: prev.project ? { ...prev.project, ...updates } : null,
    }));
  }, []);

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) {
      previewRef.current?.pause();
    } else {
      previewRef.current?.play();
    }
  }, [state.isPlaying]);

  const handleSeek = useCallback((frame: number) => {
    setState((prev) => ({ ...prev, currentFrame: frame }));
    previewRef.current?.seekToFrame(frame);
  }, []);

  const handleSeekStart = useCallback(() => {
    handleSeek(0);
  }, [handleSeek]);

  const handleSeekEnd = useCallback(() => {
    if (!state.project) {
      return;
    }
    handleSeek(state.project.totalDurationFrames - 1);
  }, [state.project, handleSeek]);

  const handleStepBack = useCallback(() => {
    handleSeek(Math.max(0, state.currentFrame - 1));
  }, [state.currentFrame, handleSeek]);

  const handleStepForward = useCallback(() => {
    if (!state.project) {
      return;
    }
    handleSeek(
      Math.min(state.project.totalDurationFrames - 1, state.currentFrame + 1),
    );
  }, [state.project, state.currentFrame, handleSeek]);

  const handleZoomChange = useCallback((zoom: number) => {
    setState((prev) => ({ ...prev, zoom }));
  }, []);

  const handleFormatChange = useCallback(
    (format: IngredientFormat) => {
      const dimensions = FORMAT_DIMENSIONS[format];
      updateProject({
        settings: {
          backgroundColor:
            state.project?.settings?.backgroundColor ?? '#000000',
          fps: state.project?.settings?.fps ?? 30,
          ...state.project?.settings,
          format,
          height: dimensions.height,
          width: dimensions.width,
        },
      });
    },
    [state.project, updateProject],
  );

  const handleAddVideoTrack = useCallback(() => {
    openGallery({
      category: IngredientCategory.VIDEO,
      onSelect: (selected) => {
        if (!selected || Array.isArray(selected) || !state.project) {
          return;
        }

        const video = selected as unknown as IIngredient;

        const videoUrl = `${EnvironmentService.ingredientsEndpoint}/videos/${video.id}`;
        const duration = video.metadataDuration || 10;
        const durationFrames = Math.round(
          duration * state.project.settings.fps,
        );

        const newTrack: IEditorTrack = {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId: video.id,
              ingredientUrl: videoUrl,
              sourceEndFrame: durationFrames,
              sourceStartFrame: 0,
              startFrame: 0,
              thumbnailUrl: video.thumbnailUrl,
            },
          ],
          id: uuidv4(),
          isLocked: false,
          isMuted: false,
          name: `Video ${state.project.tracks.filter((t) => t.type === EditorTrackType.VIDEO).length + 1}`,
          type: EditorTrackType.VIDEO,
          volume: 100,
        };

        // Update total duration if needed
        const newTotalDuration = Math.max(
          state.project.totalDurationFrames,
          durationFrames,
        );

        updateProject({
          totalDurationFrames: newTotalDuration,
          tracks: [...state.project.tracks, newTrack],
        });
      },
      title: 'Select Video',
    });
  }, [openGallery, state.project, updateProject]);

  const handleAddAudioTrack = useCallback(() => {
    openGallery({
      category: IngredientCategory.MUSIC,
      onSelect: (selected) => {
        if (!selected || Array.isArray(selected) || !state.project) {
          return;
        }

        const audio = selected as unknown as IIngredient;

        const audioUrl = `${EnvironmentService.ingredientsEndpoint}/sounds/${audio.id}`;
        const duration = audio.metadataDuration || 60;
        const durationFrames = Math.round(
          duration * state.project.settings.fps,
        );

        const newTrack: IEditorTrack = {
          clips: [
            {
              durationFrames,
              effects: [],
              id: uuidv4(),
              ingredientId: audio.id,
              ingredientUrl: audioUrl,
              sourceEndFrame: durationFrames,
              sourceStartFrame: 0,
              startFrame: 0,
              volume: 100,
            },
          ],
          id: uuidv4(),
          isLocked: false,
          isMuted: false,
          name: `Audio ${state.project.tracks.filter((t) => t.type === EditorTrackType.AUDIO).length + 1}`,
          type: EditorTrackType.AUDIO,
          volume: 100,
        };

        updateProject({
          tracks: [...state.project.tracks, newTrack],
        });
      },
      title: 'Select Music',
    });
  }, [openGallery, state.project, updateProject]);

  const handleAddTextTrack = useCallback(
    (newTrack: IEditorTrack) => {
      if (!state.project) {
        return;
      }

      updateProject({
        tracks: [...state.project.tracks, newTrack],
      });
    },
    [state.project, updateProject],
  );

  const handleTrackUpdate = useCallback(
    (trackId: string, trackUpdates: Partial<IEditorTrack>) => {
      if (!state.project) {
        return;
      }

      const updatedTracks = state.project.tracks.map((track) =>
        track.id === trackId ? { ...track, ...trackUpdates } : track,
      );

      updateProject({ tracks: updatedTracks });
    },
    [state.project, updateProject],
  );

  const handleClipMove = useCallback(
    (trackId: string, clipId: string, newStartFrame: number) => {
      if (!state.project) {
        return;
      }

      const updatedTracks = state.project.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          clips: track.clips.map((clip) =>
            clip.id === clipId ? { ...clip, startFrame: newStartFrame } : clip,
          ),
        };
      });

      // Recalculate total duration
      let maxFrame = 0;
      for (const track of updatedTracks) {
        for (const clip of track.clips) {
          const endFrame = clip.startFrame + clip.durationFrames;
          if (endFrame > maxFrame) {
            maxFrame = endFrame;
          }
        }
      }

      updateProject({
        totalDurationFrames: Math.max(maxFrame, DEFAULT_FPS * 5), // Minimum 5 seconds
        tracks: updatedTracks,
      });
    },
    [state.project, updateProject],
  );

  const handleClipResize = useCallback(
    (
      trackId: string,
      clipId: string,
      newDuration: number,
      fromStart: boolean,
    ) => {
      if (!state.project) {
        return;
      }

      const updatedTracks = state.project.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }

        return {
          ...track,
          clips: track.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip;
            }

            if (fromStart) {
              const delta = clip.durationFrames - newDuration;
              return {
                ...clip,
                durationFrames: newDuration,
                sourceStartFrame: clip.sourceStartFrame + delta,
                startFrame: clip.startFrame + delta,
              };
            }

            return {
              ...clip,
              durationFrames: newDuration,
              sourceEndFrame: clip.sourceStartFrame + newDuration,
            };
          }),
        };
      });

      // Recalculate total duration
      let maxFrame = 0;
      for (const track of updatedTracks) {
        for (const clip of track.clips) {
          const endFrame = clip.startFrame + clip.durationFrames;
          if (endFrame > maxFrame) {
            maxFrame = endFrame;
          }
        }
      }

      updateProject({
        totalDurationFrames: Math.max(maxFrame, DEFAULT_FPS * 5),
        tracks: updatedTracks,
      });
    },
    [state.project, updateProject],
  );

  const handleClipSelect = useCallback((trackId: string, clipId: string) => {
    setState((prev) => ({
      ...prev,
      selectedClipId: clipId,
      selectedTrackId: trackId,
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!state.project) {
      return;
    }

    try {
      const service = await getEditorService();
      await service.update(state.project.id, {
        name: state.project.name,
        settings: state.project.settings,
        totalDurationFrames: state.project.totalDurationFrames,
        tracks: state.project.tracks,
      });
      setState((prev) => ({
        ...prev,
        isDirty: false,
        lastSavedAt: new Date(),
      }));
      notificationsService.success('Project saved');
    } catch (error) {
      logger.error('Failed to save project', error);
      notificationsService.error('Failed to save project');
    }
  }, [state.project, notificationsService, getEditorService]);

  const handleRender = useCallback(async () => {
    if (!state.project) {
      return;
    }

    setState((prev) => ({ ...prev, isRendering: true }));

    try {
      // Save latest state before rendering
      const service = await getEditorService();
      await service.update(state.project.id, {
        name: state.project.name,
        settings: state.project.settings,
        totalDurationFrames: state.project.totalDurationFrames,
        tracks: state.project.tracks,
      });

      const { jobId } = await service.render(state.project.id);
      logger.info('Render job started', {
        jobId,
        projectId: state.project.id,
      });

      setState((prev) => ({
        ...prev,
        isDirty: false,
        lastSavedAt: new Date(),
      }));

      notificationsService.success(
        'Render started! Check the gallery for the output.',
      );
    } catch (error) {
      logger.error('Failed to start render', error);
      notificationsService.error('Failed to start render');
    } finally {
      setState((prev) => ({ ...prev, isRendering: false }));
    }
  }, [state.project, notificationsService, getEditorService]);

  const handleBack = useCallback(() => {
    if (state.isDirty) {
      openConfirm({
        confirmLabel: 'Leave',
        isError: true,
        label: 'Unsaved Changes',
        message:
          'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.',
        onConfirm: () => {
          router.push(href('/editor'));
        },
      });
      return;
    }
    router.push(href('/editor'));
  }, [state.isDirty, router, openConfirm]);

  const handleFrameChange = useCallback((frame: number) => {
    setState((prev) => ({ ...prev, currentFrame: frame }));
  }, []);

  const handlePlayingChange = useCallback((isPlaying: boolean) => {
    setState((prev) => ({ ...prev, isPlaying }));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(Math.max(0, state.currentFrame - 10));
          } else {
            handleStepBack();
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            handleSeek(
              Math.min(
                (state.project?.totalDurationFrames ?? 1) - 1,
                state.currentFrame + 10,
              ),
            );
          } else {
            handleStepForward();
          }
          break;
        case 'Home':
          e.preventDefault();
          handleSeekStart();
          break;
        case 'End':
          e.preventDefault();
          handleSeekEnd();
          break;
        case 's':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            handleSave();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handlePlayPause,
    handleStepBack,
    handleStepForward,
    handleSeekStart,
    handleSeekEnd,
    handleSeek,
    handleSave,
    state.currentFrame,
    state.project?.totalDurationFrames,
  ]);

  if (state.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (!state.project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <Button
          withWrapper={false}
          variant={ButtonVariant.DEFAULT}
          onClick={handleBack}
        >
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <EditorToolbar
        projectName={state.project.name}
        format={state.project.settings.format}
        isPlaying={state.isPlaying}
        currentFrame={state.currentFrame}
        totalFrames={state.project.totalDurationFrames}
        fps={state.project.settings.fps}
        zoom={state.zoom}
        isDirty={state.isDirty}
        isRendering={state.isRendering}
        onPlayPause={handlePlayPause}
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
      />

      {/* Main content area — three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — Text overlays */}
        <div className="w-60 shrink-0 overflow-y-auto">
          <EditorTextPanel
            tracks={state.project.tracks}
            fps={state.project.settings.fps}
            totalFrames={state.project.totalDurationFrames}
            selectedTrackId={state.selectedTrackId}
            selectedClipId={state.selectedClipId}
            onAddTextTrack={handleAddTextTrack}
            onTrackUpdate={handleTrackUpdate}
            onClipSelect={handleClipSelect}
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
                  tracks={state.project.tracks}
                  width={state.project.settings.width}
                  height={state.project.settings.height}
                  fps={state.project.settings.fps}
                  totalFrames={state.project.totalDurationFrames}
                  onFrameChange={handleFrameChange}
                  onPlayingChange={handlePlayingChange}
                />
              </div>
            </div>
          </div>

          {/* Timeline area */}
          <div className="h-64 shrink-0 border-t border-white/[0.08] overflow-hidden">
            <EditorTimeline
              tracks={state.project.tracks}
              currentFrame={state.currentFrame}
              totalFrames={state.project.totalDurationFrames}
              fps={state.project.settings.fps}
              zoom={state.zoom}
              onSeek={handleSeek}
              onTrackUpdate={handleTrackUpdate}
              onClipMove={handleClipMove}
              onClipResize={handleClipResize}
              onClipSelect={handleClipSelect}
              selectedClipId={state.selectedClipId}
            />
          </div>
        </div>

        {/* Right panel — Effects & Properties */}
        <div className="w-64 shrink-0 overflow-y-auto flex flex-col">
          <EditorEffectsPanel
            tracks={state.project.tracks}
            selectedTrackId={state.selectedTrackId}
            selectedClipId={state.selectedClipId}
            onTrackUpdate={handleTrackUpdate}
          />
          <div className="border-t border-white/[0.08]">
            <EditorPropertiesPanel
              tracks={state.project.tracks}
              fps={state.project.settings.fps}
              selectedTrackId={state.selectedTrackId}
              selectedClipId={state.selectedClipId}
              onTrackUpdate={handleTrackUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
