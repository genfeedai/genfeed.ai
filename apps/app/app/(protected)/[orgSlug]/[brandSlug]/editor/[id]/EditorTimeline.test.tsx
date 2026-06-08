import '@testing-library/jest-dom/vitest';
import { EditorTrackType } from '@genfeedai/enums';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorTimeline from './EditorTimeline';

vi.mock('@ui/primitives/button', () => ({
  Button: ({
    'aria-label': ariaLabel,
    children,
    onClick,
    tooltip,
  }: {
    'aria-label'?: string;
    children?: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    tooltip?: string;
  }) => (
    <button aria-label={ariaLabel ?? tooltip} type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

const tracks = [
  {
    clips: [
      {
        durationFrames: 90,
        id: 'video-clip',
        startFrame: 30,
        textOverlay: { text: 'Intro clip' },
        thumbnailUrl: 'https://example.test/thumb.jpg',
      },
    ],
    id: 'video-track',
    isLocked: false,
    isMuted: false,
    name: 'Main video',
    type: EditorTrackType.VIDEO,
  },
  {
    clips: [
      {
        durationFrames: 45,
        id: 'audio-clip',
        startFrame: 10,
      },
    ],
    id: 'audio-track',
    isLocked: true,
    isMuted: true,
    name: 'Music bed',
    type: EditorTrackType.AUDIO,
  },
];

function renderTimeline(overrides = {}) {
  const props = {
    currentFrame: 60,
    fps: 30,
    onClipMove: vi.fn(),
    onClipResize: vi.fn(),
    onClipSelect: vi.fn(),
    onSeek: vi.fn(),
    onTrackUpdate: vi.fn(),
    selectedClipId: 'video-clip',
    totalFrames: 300,
    tracks,
    zoom: 2,
    ...overrides,
  };

  return {
    props,
    ...render(<EditorTimeline {...props} />),
  };
}

describe('EditorTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 800,
      toJSON: () => ({}),
      top: 0,
      width: 800,
      x: 0,
      y: 0,
    });
  });

  it('renders empty timelines and seeks from the ruler/playhead', () => {
    const { props } = renderTimeline({ currentFrame: 0, tracks: [] });

    expect(
      screen.getByText('No tracks. Add a video or audio track to get started.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('00:00:00').length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Timeline ruler - click to seek',
      }),
      { clientX: 252 },
    );
    expect(props.onSeek).toHaveBeenCalledWith(30);

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Timeline playhead' }),
    );
    fireEvent.mouseMove(document, { clientX: 792 });
    expect(props.onSeek).toHaveBeenCalledWith(300);
    fireEvent.mouseUp(document);
  });

  it('renders tracks and handles clip selection, movement, and resizing', () => {
    const { props } = renderTimeline();

    expect(screen.getByText('Main video')).toBeInTheDocument();
    expect(screen.getByText('Music bed')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute' })).toHaveTextContent(
      'Mute',
    );
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveTextContent(
      'Muted',
    );
    expect(screen.getByRole('button', { name: 'Unlock' })).toHaveTextContent(
      'Locked',
    );
    expect(screen.getByText('Intro clip')).toBeInTheDocument();

    const [videoClip, audioClip] = screen.getAllByRole('button', {
      name: 'Timeline clip',
    });

    fireEvent.mouseDown(videoClip, { clientX: 100 });
    expect(props.onClipSelect).toHaveBeenCalledWith(
      'video-track',
      'video-clip',
    );
    fireEvent.mouseMove(document, { clientX: 120 });
    expect(props.onClipMove).toHaveBeenCalledWith(
      'video-track',
      'video-clip',
      40,
    );
    fireEvent.mouseUp(document);

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Resize clip start' }),
      { clientX: 100 },
    );
    fireEvent.mouseMove(document, { clientX: 120 });
    expect(props.onClipResize).toHaveBeenCalledWith(
      'video-track',
      'video-clip',
      80,
      true,
    );
    fireEvent.mouseUp(document);

    fireEvent.mouseDown(
      screen.getByRole('button', { name: 'Resize clip end' }),
      {
        clientX: 100,
      },
    );
    fireEvent.mouseMove(document, { clientX: 130 });
    expect(props.onClipResize).toHaveBeenCalledWith(
      'video-track',
      'video-clip',
      105,
      false,
    );
    fireEvent.mouseUp(document);

    fireEvent.mouseDown(audioClip, { clientX: 100 });
    expect(props.onClipSelect).not.toHaveBeenCalledWith(
      'audio-track',
      'audio-clip',
    );
  });
});
