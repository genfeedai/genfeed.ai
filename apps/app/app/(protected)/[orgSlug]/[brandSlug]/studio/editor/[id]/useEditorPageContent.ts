import { useBrandId } from '@contexts/user/brand-context/brand-context';
import {
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IEditorProject,
  IEditorTrack,
} from '@genfeedai/contracts/interfaces';
import type { EditorState } from '@genfeedai/props/studio/editor-page-content.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  EditorHistory,
  EditorProjectContent,
  EditorSaveWrite,
} from '@props/studio/editor-save.props';
import {
  useConfirmModal,
  useGalleryModal,
} from '@providers/global-modals/global-modals.provider';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { EditorProjectsService } from '@services/editor/editor-projects.service';
import { getErrorStatus } from '@utils/error/json-api-status.util';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import {
  EditorSaveConflictError,
  EditorSaveRejectedError,
  editorSaveOutbox,
  serializeEditorProjectContent,
} from '@/lib/studio-editor/editor-save-outbox';
import type { EditorPreviewRef } from './EditorPreview';

const DEFAULT_FPS = 30;
/** Quiet period after the last edit before it is saved. */
export const EDITOR_SAVE_DEBOUNCE_MS = 750;
/** Continuous edits (a drag) still save this long after the first one. */
export const EDITOR_SAVE_MAX_WAIT_MS = 1500;
const HISTORY_LIMIT = 100;
/** Updates of one gesture this close together collapse into one undo step. */
const GESTURE_WINDOW_MS = 1000;
const HTTP_CONFLICT = 409;
/**
 * Client errors the same request will always get again. 408 and 429 are
 * worth retrying; so is anything without a status (network, 5xx).
 */
const PERMANENT_SAVE_STATUSES = new Set([400, 403, 404, 410, 422]);

const EMPTY_HISTORY: EditorHistory = {
  future: [],
  lastEditAt: 0,
  lastGestureKey: null,
  past: [],
};

function contentOf(project: IEditorProject): EditorProjectContent {
  return {
    name: project.name,
    settings: project.settings,
    totalDurationFrames: project.totalDurationFrames,
    tracks: project.tracks,
  };
}

/**
 * An edit this browser queued but never saw acknowledged is restored only
 * when the server still holds a version it was made on top of; otherwise the
 * project changed elsewhere and the local copy is stale.
 */
function resolveUnsentEdit(
  projectId: string,
  ownerId: string | null,
  serverContent: EditorProjectContent,
): EditorProjectContent | null {
  if (!ownerId) {
    return null;
  }
  const unsent = editorSaveOutbox.readUnsent(projectId, ownerId);
  if (!unsent) {
    return null;
  }
  const serverKey = serializeEditorProjectContent(serverContent);
  if (
    serializeEditorProjectContent(unsent.content) !== serverKey &&
    unsent.baseKeys.includes(serverKey)
  ) {
    return unsent.content;
  }
  editorSaveOutbox.discardUnsent(projectId);
  return null;
}

const FORMAT_DIMENSIONS: Record<
  IngredientFormat,
  { width: number; height: number }
> = {
  [IngredientFormat.LANDSCAPE]: { height: 1080, width: 1920 },
  [IngredientFormat.PORTRAIT]: { height: 1920, width: 1080 },
  [IngredientFormat.SQUARE]: { height: 1080, width: 1080 },
};

export function useEditorPageContent(projectId: string) {
  const _brandId = useBrandId();
  const { isLoaded: isIdentityLoaded, userId } = useAuthIdentity();
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const { openGallery } = useGalleryModal();
  const { openConfirm } = useConfirmModal();
  const notificationsService = NotificationsService.getInstance();
  const previewRef = useRef<EditorPreviewRef | null>(null);
  // Last version the server holds; a save conflict falls back to it.
  const savedProjectRef = useRef<IEditorProject | null>(null);

  const getEditorService = useAuthedService((token: string) =>
    EditorProjectsService.getInstance(token),
  );
  // Queued writes outlive this page; they resolve the service through a ref.
  const getEditorServiceRef = useRef(getEditorService);
  getEditorServiceRef.current = getEditorService;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // The load reads these through refs: re-running it for a new service or
  // notifier identity would reload the project over unsaved edits and history.
  const notificationsServiceRef = useRef(notificationsService);
  notificationsServiceRef.current = notificationsService;

  const [state, setState] = useState<EditorState>({
    currentFrame: 0,
    editVersion: 0,
    hasSaveConflict: false,
    history: EMPTY_HISTORY,
    isDirty: false,
    isDuplicating: false,
    isLoading: true,
    isPlaying: false,
    isRendering: false,
    project: null,
    saveStatus: 'idle',
    selectedClipId: null,
    selectedTrackId: null,
    zoom: 2,
  });

  const isReadOnly = Boolean(state.project?.isLocked) || state.hasSaveConflict;
  const canUndo = !isReadOnly && state.history.past.length > 0;
  const canRedo = !isReadOnly && state.history.future.length > 0;
  // Read by the save scheduler and the page-leave handlers, which must see the
  // latest edit without re-subscribing on every change.
  const projectRef = useRef(state.project);
  projectRef.current = state.project;
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const saveTimerRef = useRef<number | null>(null);
  const firstUnsavedEditAtRef = useRef<number | null>(null);

  // The server refuses updates to composition-backed projects with a 409.
  // Switch to read-only on the server version instead of a generic error;
  // pending local edits cannot be saved, so they are dropped.
  const handleSaveConflict = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setState((prev) => {
      const serverProject = savedProjectRef.current ?? prev.project;
      return {
        ...prev,
        hasSaveConflict: true,
        history: EMPTY_HISTORY,
        isDirty: false,
        project: serverProject ? { ...serverProject, isLocked: true } : null,
        saveStatus: 'conflict',
      };
    });
  }, []);

  const write = useCallback<EditorSaveWrite>(
    async (targetProjectId, content, { isKeepalive }) => {
      const service = await getEditorServiceRef.current();
      try {
        return await service.update(targetProjectId, content, { isKeepalive });
      } catch (error) {
        const status = getErrorStatus(error);
        if (status === HTTP_CONFLICT) {
          throw new EditorSaveConflictError('The project is locked');
        }
        if (status !== undefined && PERMANENT_SAVE_STATUSES.has(status)) {
          throw new EditorSaveRejectedError('The server rejected the save');
        }
        throw error;
      }
    },
    [],
  );

  // Hands the latest content to the outbox now. Stable on purpose: it reads
  // everything through refs, so the leave handlers never re-bind.
  const flushEdits = useCallback(
    (options: { isKeepalive?: boolean } = {}) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      firstUnsavedEditAtRef.current = null;
      const project = projectRef.current;
      if (!project || isReadOnlyRef.current) {
        return;
      }
      editorSaveOutbox.enqueue(project.id, contentOf(project), {
        isKeepalive: options.isKeepalive,
        ownerId: userIdRef.current,
        write,
      });
    },
    [write],
  );

  useEffect(() => {
    captureAnalyticsEvent(ANALYTICS_EVENTS.STUDIO_EDITOR_OPENED, {
      surface: 'canvas',
    });
  }, []);

  // Load the project once the signed-in user is known: an edit this browser
  // queued for them but never saw saved is restored over the server copy.
  useEffect(() => {
    if (!isIdentityLoaded) {
      return;
    }
    const controller = new AbortController();

    const loadProject = async () => {
      try {
        // Writes this tab still has queued (an in-app round trip) land first,
        // or the read would show an older version.
        if (editorSaveOutbox.hasUnsavedEdits(projectId)) {
          await editorSaveOutbox.settle(projectId);
        }
        const service = await getEditorServiceRef.current();
        const project = await service.findById(projectId);

        if (controller.signal.aborted) {
          return;
        }

        const serverContent = project ? contentOf(project) : null;
        const restored =
          project && serverContent && !project.isLocked
            ? resolveUnsentEdit(projectId, userIdRef.current, serverContent)
            : null;
        if (serverContent) {
          editorSaveOutbox.setAcknowledged(projectId, serverContent);
        }

        savedProjectRef.current = project ?? null;
        setState((prev) => ({
          ...prev,
          editVersion: restored ? prev.editVersion + 1 : prev.editVersion,
          history: EMPTY_HISTORY,
          isDirty: Boolean(restored),
          isLoading: false,
          project: project && restored ? { ...project, ...restored } : project,
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load project', error);
          notificationsServiceRef.current.error('Failed to load project');
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    loadProject();

    return () => controller.abort();
  }, [projectId, isIdentityLoaded]);

  useEffect(() => {
    return editorSaveOutbox.subscribe(projectId, (status) => {
      if (status === 'conflict') {
        handleSaveConflict();
        return;
      }
      const hasUnsaved =
        saveTimerRef.current !== null ||
        editorSaveOutbox.hasUnsavedEdits(projectId);
      setState((prev) => ({
        ...prev,
        isDirty: status === 'saved' ? hasUnsaved : prev.isDirty,
        saveStatus: status,
      }));
    });
  }, [projectId, handleSaveConflict]);

  // Every edit is saved within EDITOR_SAVE_MAX_WAIT_MS: a quiet period after
  // the last change, capped for continuous gestures.
  useEffect(() => {
    if (state.editVersion === 0 || isReadOnly) {
      return;
    }
    const now = Date.now();
    firstUnsavedEditAtRef.current ??= now;
    const delay = Math.max(
      0,
      Math.min(
        EDITOR_SAVE_DEBOUNCE_MS,
        firstUnsavedEditAtRef.current + EDITOR_SAVE_MAX_WAIT_MS - now,
      ),
    );
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushEdits();
    }, delay);
  }, [state.editVersion, isReadOnly, flushEdits]);

  // A reload or tab close inside the quiet period would otherwise lose the
  // last edit: keepalive lets that final write outlive the page, and the
  // browser asks before leaving while anything is still unsaved.
  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') {
        flushEdits({ isKeepalive: true });
      }
    };
    const flushOnPageHide = () => {
      flushEdits({ isKeepalive: true });
    };
    const confirmUnsavedLeave = (event: BeforeUnloadEvent) => {
      flushEdits({ isKeepalive: true });
      if (editorSaveOutbox.hasUnsavedEdits(projectId)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushOnPageHide);
    window.addEventListener('beforeunload', confirmUnsavedLeave);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushOnPageHide);
      window.removeEventListener('beforeunload', confirmUnsavedLeave);
    };
  }, [projectId, flushEdits]);

  // Leaving the project in-app queues its latest content; the outbox finishes
  // the write after this page is gone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: projectId is the departure trigger.
  useEffect(() => {
    return () => {
      flushEdits();
    };
  }, [projectId, flushEdits]);

  // Every edit funnels through here, so a read-only project never turns dirty
  // and never reaches a save. Each edit is one undo step, except continuous
  // updates of one gesture (`gestureKey`), which collapse into the first.
  const updateProject = useCallback(
    (updates: Partial<IEditorProject>, gestureKey: string | null = null) => {
      const now = Date.now();
      setState((prev) => {
        if (!prev.project || prev.project.isLocked || prev.hasSaveConflict) {
          return prev;
        }

        const history = prev.history;
        const isSameGesture =
          gestureKey !== null &&
          gestureKey === history.lastGestureKey &&
          now - history.lastEditAt < GESTURE_WINDOW_MS;

        return {
          ...prev,
          editVersion: prev.editVersion + 1,
          history: {
            future: [],
            lastEditAt: now,
            lastGestureKey: gestureKey,
            past: isSameGesture
              ? history.past
              : [...history.past, contentOf(prev.project)].slice(
                  -HISTORY_LIMIT,
                ),
          },
          isDirty: true,
          project: { ...prev.project, ...updates },
        };
      });
    },
    [],
  );

  const stepHistory = useCallback((direction: 'undo' | 'redo') => {
    setState((prev) => {
      if (!prev.project || prev.project.isLocked || prev.hasSaveConflict) {
        return prev;
      }
      const { future, past } = prev.history;
      const source = direction === 'undo' ? past : future;
      const target = source.at(-1);
      if (!target) {
        return prev;
      }
      const current = contentOf(prev.project);

      return {
        ...prev,
        editVersion: prev.editVersion + 1,
        history: {
          future:
            direction === 'undo' ? [...future, current] : future.slice(0, -1),
          lastEditAt: 0,
          lastGestureKey: null,
          past: direction === 'undo' ? past.slice(0, -1) : [...past, current],
        },
        isDirty: true,
        project: { ...prev.project, ...target },
      };
    });
  }, []);

  const handleUndo = useCallback(() => stepHistory('undo'), [stepHistory]);
  const handleRedo = useCallback(() => stepHistory('redo'), [stepHistory]);

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
    if (isReadOnly) {
      return;
    }

    openGallery({
      category: IngredientCategory.VIDEO,
      onSelect: (selected) => {
        const video = selected?.[0];
        if (!video || !state.project) {
          return;
        }

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
  }, [isReadOnly, openGallery, state.project, updateProject]);

  const handleAddAudioTrack = useCallback(() => {
    if (isReadOnly) {
      return;
    }

    openGallery({
      category: IngredientCategory.MUSIC,
      onSelect: (selected) => {
        const audio = selected?.[0];
        if (!audio || !state.project) {
          return;
        }

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
  }, [isReadOnly, openGallery, state.project, updateProject]);

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

      updateProject(
        { tracks: updatedTracks },
        `track:${trackId}:${Object.keys(trackUpdates).sort().join(',')}`,
      );
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

      updateProject(
        {
          totalDurationFrames: Math.max(maxFrame, DEFAULT_FPS * 5), // Minimum 5 seconds
          tracks: updatedTracks,
        },
        `move:${trackId}:${clipId}`,
      );
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

      updateProject(
        {
          totalDurationFrames: Math.max(maxFrame, DEFAULT_FPS * 5),
          tracks: updatedTracks,
        },
        `resize:${trackId}:${clipId}:${fromStart ? 'start' : 'end'}`,
      );
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

  // An explicit save (button or Cmd/Ctrl+S) writes now instead of after the
  // quiet period and reports the outcome.
  const handleSave = useCallback(async () => {
    if (!projectRef.current || isReadOnly) {
      return;
    }

    flushEdits();
    const status = await editorSaveOutbox.settle(projectId);
    if (status === 'saved' || status === 'idle') {
      notificationsService.success('Project saved');
    } else if (status === 'failed') {
      notificationsService.error('Failed to save project');
    }
  }, [isReadOnly, projectId, flushEdits, notificationsService]);

  const handleRender = useCallback(async () => {
    if (!projectRef.current || isReadOnly) {
      return;
    }

    setState((prev) => ({ ...prev, isRendering: true }));

    try {
      // The render reads the saved project, so every edit lands first.
      flushEdits();
      const status = await editorSaveOutbox.settle(projectId);
      if (status === 'conflict') {
        return;
      }
      if (status === 'failed') {
        throw new Error('Unsaved edits block the render');
      }

      const service = await getEditorService();
      const { jobId } = await service.render(projectId);
      logger.info('Render job started', { jobId, projectId });

      notificationsService.success(
        'Render started! Check the gallery for the output.',
      );
    } catch (error) {
      logger.error('Failed to start render', error);
      notificationsService.error('Failed to start render');
    } finally {
      setState((prev) => ({ ...prev, isRendering: false }));
    }
  }, [
    isReadOnly,
    projectId,
    flushEdits,
    notificationsService,
    getEditorService,
  ]);

  const handleDuplicate = useCallback(async () => {
    if (!state.project || state.isDuplicating) {
      return;
    }

    const sourceId = state.project.id;
    setState((prev) => ({ ...prev, isDuplicating: true }));

    try {
      const service = await getEditorService();
      const copy = await service.duplicate(sourceId);
      push(href(`${APP_ROUTES.STUDIO.EDITOR}/${copy.id}`));
    } catch (error) {
      logger.error('Failed to duplicate project', error);
      notificationsService.error('Failed to duplicate project');
    } finally {
      setState((prev) => ({ ...prev, isDuplicating: false }));
    }
  }, [
    state.project,
    state.isDuplicating,
    getEditorService,
    push,
    href,
    notificationsService,
  ]);

  // Leaving hands the latest edit to the outbox, which keeps saving after the
  // page is gone. Only an edit the server refused asks before leaving; it
  // stays on this device and is restored when the project reopens.
  const handleBack = useCallback(() => {
    // Read before flushing: the flush retries right away and reports saving.
    const hasFailedSave = editorSaveOutbox.getStatus(projectId) === 'failed';
    flushEdits();
    if (hasFailedSave) {
      openConfirm({
        confirmLabel: 'Leave',
        isError: true,
        label: 'Unsaved Changes',
        message:
          'Your latest edits could not be saved yet. They stay on this device and come back when you reopen the project. Leave anyway?',
        onConfirm: () => {
          push(href(APP_ROUTES.STUDIO.EDITOR));
        },
      });
      return;
    }
    push(href(APP_ROUTES.STUDIO.EDITOR));
  }, [projectId, flushEdits, push, openConfirm, href]);

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
        case 'z':
        case 'Z':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
          break;
        case 'y':
          if (e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleRedo();
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
    handleUndo,
    handleRedo,
    state.currentFrame,
    state.project?.totalDurationFrames,
  ]);

  return {
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
  };
}
