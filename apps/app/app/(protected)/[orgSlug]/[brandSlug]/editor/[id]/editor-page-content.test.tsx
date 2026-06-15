import '@testing-library/jest-dom/vitest';
import {
  EditorTrackType,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type Ref, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorPreviewRef } from './EditorPreview';
import EditorPageContent from './editor-page-content';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  findById: vi.fn(),
  href: vi.fn((path: string) => `/org/acme/brand/demo${path}`),
  info: vi.fn(),
  openConfirm: vi.fn(),
  openGallery: vi.fn(),
  pause: vi.fn(),
  play: vi.fn(),
  push: vi.fn(),
  renderProject: vi.fn(),
  seekToFrame: vi.fn(),
  success: vi.fn(),
  track: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrandId: () => 'brand-1',
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => async () => ({
    findById: mocks.findById,
    render: mocks.renderProject,
    update: mocks.update,
  }),
}));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: mocks.href,
  }),
}));

vi.mock('@providers/global-modals/global-modals.provider', () => ({
  useConfirmModal: () => ({
    openConfirm: mocks.openConfirm,
  }),
  useGalleryModal: () => ({
    openGallery: mocks.openGallery,
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://cdn.example.test',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: {
    error: mocks.error,
    info: mocks.info,
  },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: mocks.error,
      success: mocks.success,
    }),
  },
}));

vi.mock('@vercel/analytics', () => ({
  track: mocks.track,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'uuid-1'),
}));

vi.mock('./EditorToolbar', () => ({
  default: ({
    currentFrame,
    format,
    isDirty,
    isPlaying,
    isRendering,
    onAddAudioTrack,
    onAddVideoTrack,
    onBack,
    onFormatChange,
    onPlayPause,
    onRender,
    onSave,
    onSeekEnd,
    onSeekStart,
    onStepBack,
    onStepForward,
    onZoomChange,
    projectName,
  }: {
    currentFrame: number;
    format: IngredientFormat;
    isDirty: boolean;
    isPlaying: boolean;
    isRendering: boolean;
    onAddAudioTrack: () => void;
    onAddVideoTrack: () => void;
    onBack: () => void;
    onFormatChange: (format: IngredientFormat) => void;
    onPlayPause: () => void;
    onRender: () => void;
    onSave: () => void;
    onSeekEnd: () => void;
    onSeekStart: () => void;
    onStepBack: () => void;
    onStepForward: () => void;
    onZoomChange: (zoom: number) => void;
    projectName: string;
  }) => (
    <section aria-label="toolbar">
      <div>{projectName}</div>
      <div>format:{format}</div>
      <div>frame:{currentFrame}</div>
      <div>dirty:{String(isDirty)}</div>
      <div>playing:{String(isPlaying)}</div>
      <div>rendering:{String(isRendering)}</div>
      <button type="button" onClick={onBack}>
        Back
      </button>
      <button type="button" onClick={onPlayPause}>
        Play Pause
      </button>
      <button type="button" onClick={onSeekStart}>
        Seek Start
      </button>
      <button type="button" onClick={onSeekEnd}>
        Seek End
      </button>
      <button type="button" onClick={onStepBack}>
        Step Back
      </button>
      <button type="button" onClick={onStepForward}>
        Step Forward
      </button>
      <button type="button" onClick={() => onZoomChange(4)}>
        Zoom
      </button>
      <button
        type="button"
        onClick={() => onFormatChange(IngredientFormat.PORTRAIT)}
      >
        Portrait
      </button>
      <button type="button" onClick={onAddVideoTrack}>
        Add Video
      </button>
      <button type="button" onClick={onAddAudioTrack}>
        Add Audio
      </button>
      <button type="button" onClick={onSave}>
        Save
      </button>
      <button type="button" onClick={onRender}>
        Render
      </button>
    </section>
  ),
}));

vi.mock('./EditorPreview', () => ({
  default: ({
    onFrameChange,
    onPlayingChange,
    ref,
  }: {
    onFrameChange: (frame: number) => void;
    onPlayingChange: (isPlaying: boolean) => void;
    ref?: Ref<EditorPreviewRef>;
  }) => {
    useImperativeHandle(ref, () => ({
      pause: mocks.pause,
      play: mocks.play,
      seekToFrame: mocks.seekToFrame,
    }));

    return (
      <section aria-label="preview">
        <button type="button" onClick={() => onFrameChange(42)}>
          Preview Frame
        </button>
        <button type="button" onClick={() => onPlayingChange(true)}>
          Preview Playing
        </button>
      </section>
    );
  },
}));

vi.mock('./EditorTextPanel', () => ({
  default: ({
    onAddTextTrack,
    onClipSelect,
    onTrackUpdate,
  }: {
    onAddTextTrack: (track: unknown) => void;
    onClipSelect: (trackId: string, clipId: string) => void;
    onTrackUpdate: (trackId: string, updates: unknown) => void;
  }) => (
    <section aria-label="text-panel">
      <button
        type="button"
        onClick={() =>
          onAddTextTrack({
            clips: [],
            id: 'text-track',
            isLocked: false,
            isMuted: false,
            name: 'Text 1',
            type: EditorTrackType.TEXT,
          })
        }
      >
        Add Text Track
      </button>
      <button
        type="button"
        onClick={() => onTrackUpdate('video-track', { isMuted: true })}
      >
        Mute Track
      </button>
      <button
        type="button"
        onClick={() => onClipSelect('video-track', 'clip-1')}
      >
        Select Clip
      </button>
    </section>
  ),
}));

vi.mock('./EditorTimeline', () => ({
  default: ({
    onClipMove,
    onClipResize,
    onClipSelect,
    onSeek,
    onTrackUpdate,
  }: {
    onClipMove: (trackId: string, clipId: string, frame: number) => void;
    onClipResize: (
      trackId: string,
      clipId: string,
      duration: number,
      fromStart: boolean,
    ) => void;
    onClipSelect: (trackId: string, clipId: string) => void;
    onSeek: (frame: number) => void;
    onTrackUpdate: (trackId: string, updates: unknown) => void;
  }) => (
    <section aria-label="timeline">
      <button type="button" onClick={() => onSeek(12)}>
        Timeline Seek
      </button>
      <button
        type="button"
        onClick={() => onTrackUpdate('video-track', { isLocked: true })}
      >
        Lock Track
      </button>
      <button
        type="button"
        onClick={() => onClipMove('video-track', 'clip-1', 45)}
      >
        Move Clip
      </button>
      <button
        type="button"
        onClick={() => onClipResize('video-track', 'clip-1', 30, false)}
      >
        Resize Clip End
      </button>
      <button
        type="button"
        onClick={() => onClipResize('video-track', 'clip-1', 20, true)}
      >
        Resize Clip Start
      </button>
      <button
        type="button"
        onClick={() => onClipSelect('video-track', 'clip-1')}
      >
        Timeline Select
      </button>
    </section>
  ),
}));

vi.mock('./EditorEffectsPanel', () => ({
  default: ({
    onTrackUpdate,
  }: {
    onTrackUpdate: (trackId: string, updates: unknown) => void;
  }) => (
    <section aria-label="effects">
      <button
        type="button"
        onClick={() => onTrackUpdate('video-track', { effects: ['blur'] })}
      >
        Add Effect
      </button>
    </section>
  ),
}));

vi.mock('./EditorPropertiesPanel', () => ({
  default: ({
    onTrackUpdate,
  }: {
    onTrackUpdate: (trackId: string, updates: unknown) => void;
  }) => (
    <section aria-label="properties">
      <button
        type="button"
        onClick={() => onTrackUpdate('video-track', { volume: 50 })}
      >
        Set Volume
      </button>
    </section>
  ),
}));

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    brand: 'brand-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'editor-123',
    isDeleted: false,
    name: 'Launch Reel',
    organization: 'org-1',
    settings: {
      backgroundColor: '#000000',
      format: IngredientFormat.LANDSCAPE,
      fps: 30,
      height: 1080,
      width: 1920,
    },
    totalDurationFrames: 120,
    tracks: [
      {
        clips: [
          {
            durationFrames: 60,
            effects: [],
            id: 'clip-1',
            ingredientId: 'video-1',
            ingredientUrl: 'https://cdn.example.test/videos/video-1',
            sourceEndFrame: 60,
            sourceStartFrame: 0,
            startFrame: 0,
            thumbnailUrl: 'thumb.jpg',
          },
        ],
        id: 'video-track',
        isLocked: false,
        isMuted: false,
        name: 'Video 1',
        type: EditorTrackType.VIDEO,
        volume: 100,
      },
    ],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function renderLoadedEditor(project = makeProject()) {
  mocks.findById.mockResolvedValue(project);
  render(<EditorPageContent projectId="editor-123" />);
  expect(await screen.findByText('Launch Reel')).toBeVisible();
}

describe('EditorPageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(makeProject());
    mocks.renderProject.mockResolvedValue({ jobId: 'render-1' });
    mocks.update.mockResolvedValue(makeProject());
  });

  it('loads the editor and drives timeline, panels, playback, save, and render actions', async () => {
    await renderLoadedEditor();

    expect(mocks.findById).toHaveBeenCalledWith('editor-123');
    expect(mocks.track).toHaveBeenCalledWith('studio_editor_opened', {
      surface: 'canvas',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Play Pause' }));
    expect(mocks.play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Playing' }));
    expect(await screen.findByText('playing:true')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Play Pause' }));
    expect(mocks.pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Frame' }));
    expect(await screen.findByText('frame:42')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Seek Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seek End' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Step Forward' }));
    fireEvent.click(screen.getByRole('button', { name: 'Timeline Seek' }));
    expect(mocks.seekToFrame).toHaveBeenCalledWith(0);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(119);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(118);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(119);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByRole('button', { name: 'Portrait' }));
    expect(
      await screen.findByText(`format:${IngredientFormat.PORTRAIT}`),
    ).toBeVisible();
    expect(await screen.findByText('dirty:true')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Add Text Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Clip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lock Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Clip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resize Clip End' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resize Clip Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Timeline Select' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Effect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Volume' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith(
        'editor-123',
        expect.objectContaining({
          name: 'Launch Reel',
          totalDurationFrames: expect.any(Number),
          tracks: expect.any(Array),
        }),
      );
      expect(mocks.success).toHaveBeenCalledWith('Project saved');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Render' }));
    await waitFor(() => {
      expect(mocks.renderProject).toHaveBeenCalledWith('editor-123');
      expect(mocks.success).toHaveBeenCalledWith(
        'Render started! Check the gallery for the output.',
      );
    });
  });

  it('adds a video track from the gallery callback', async () => {
    await renderLoadedEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add Video' }));
    expect(mocks.openGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        category: IngredientCategory.VIDEO,
        title: 'Select Video',
      }),
    );
    act(() => {
      mocks.openGallery.mock.calls.at(-1)?.[0].onSelect({
        id: 'video-2',
        metadataDuration: 4,
        thumbnailUrl: 'video-thumb.jpg',
      });
    });

    await waitFor(() => expect(screen.getByText('dirty:true')).toBeVisible());

    expect(screen.getByText('dirty:true')).toBeVisible();
  });

  it('adds an audio track from the gallery callback', async () => {
    await renderLoadedEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Add Audio' }));
    expect(mocks.openGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        category: IngredientCategory.MUSIC,
        title: 'Select Music',
      }),
    );
    act(() => {
      mocks.openGallery.mock.calls.at(-1)?.[0].onSelect({
        id: 'audio-1',
        metadataDuration: 8,
      });
    });

    await waitFor(() => expect(screen.getByText('dirty:true')).toBeVisible());
  });

  it('confirms before leaving with dirty edits and navigates directly when clean', async () => {
    await renderLoadedEditor();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mocks.push).toHaveBeenCalledWith('/org/acme/brand/demo/editor');

    fireEvent.click(screen.getByRole('button', { name: 'Add Text Track' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(mocks.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'Leave',
        label: 'Unsaved Changes',
      }),
    );
    mocks.openConfirm.mock.calls.at(-1)?.[0].onConfirm();
    expect(mocks.push).toHaveBeenCalledWith('/org/acme/brand/demo/editor');
  });

  it('supports keyboard shortcuts without hijacking form inputs', async () => {
    await renderLoadedEditor();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft', shiftKey: true });
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(mocks.seekToFrame).toHaveBeenCalledWith(1);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(0);
    expect(mocks.seekToFrame).toHaveBeenCalledWith(119);
    expect(mocks.play).toHaveBeenCalled();
    input.remove();
  });

  it('shows the not found state', async () => {
    mocks.findById.mockResolvedValue(null);
    render(<EditorPageContent projectId="missing-project" />);

    expect(await screen.findByText('Project not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Go Back' }));
    expect(mocks.push).toHaveBeenCalledWith('/org/acme/brand/demo/editor');
  });

  it('shows the load failure state', async () => {
    mocks.findById.mockRejectedValue(new Error('network down'));
    render(<EditorPageContent projectId="broken-project" />);

    await waitFor(() => {
      expect(mocks.error).toHaveBeenCalledWith(
        'Failed to load project',
        expect.any(Error),
      );
      expect(mocks.error).toHaveBeenCalledWith('Failed to load project');
    });
  });
});
