import '@testing-library/jest-dom';
import { EditorTrackType } from '@genfeedai/enums';
import { act, render, screen } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPreview, { type EditorPreviewRef } from './EditorPreview';

const playerControls = {
  addEventListener: vi.fn(),
  getCurrentFrame: vi.fn(() => 42),
  pause: vi.fn(),
  play: vi.fn(),
  removeEventListener: vi.fn(),
  seekTo: vi.fn(),
  toggle: vi.fn(),
};

const listeners = new Map<string, () => void>();

vi.mock('remotion', () => ({
  AbsoluteFill: ({
    children,
    className,
    style,
  }: {
    children?: ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }) => (
    <div className={className} data-testid="absolute-fill" style={style}>
      {children}
    </div>
  ),
  Audio: (props: {
    endAt?: number;
    src: string;
    startFrom?: number;
    volume?: number;
  }) => <div data-testid="audio" data-props={JSON.stringify(props)} />,
  OffthreadVideo: (props: {
    endAt?: number;
    src: string;
    startFrom?: number;
    style?: React.CSSProperties;
    volume?: number;
  }) => <div data-testid="video" data-props={JSON.stringify(props)} />,
  Sequence: ({
    children,
    durationInFrames,
    from,
  }: {
    children?: ReactNode;
    durationInFrames: number;
    from: number;
  }) => (
    <div
      data-testid="sequence"
      data-duration={durationInFrames}
      data-from={from}
    >
      {children}
    </div>
  ),
  useVideoConfig: vi.fn(() => ({ fps: 30, height: 1080, width: 1920 })),
}));

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  const MockPlayer = React.forwardRef(
    (
      {
        component: Component,
        inputProps,
        ...props
      }: {
        component: React.ComponentType<{ tracks: unknown[] }>;
        inputProps: { tracks: unknown[] };
      },
      ref,
    ) => {
      React.useImperativeHandle(ref, () => playerControls);

      return (
        <div data-testid="mock-player" data-props={JSON.stringify(props)}>
          <Component {...inputProps} />
        </div>
      );
    },
  );

  return { Player: MockPlayer };
});

describe('EditorPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    playerControls.getCurrentFrame.mockReturnValue(42);
    playerControls.addEventListener.mockImplementation(
      (event: string, listener: () => void) => {
        listeners.set(event, listener);
      },
    );
    playerControls.removeEventListener.mockImplementation(
      (event: string, listener: () => void) => {
        if (listeners.get(event) === listener) {
          listeners.delete(event);
        }
      },
    );
  });

  it('renders the empty editor preview and wires player props', () => {
    render(
      <EditorPreview
        tracks={[]}
        width={1920}
        height={1080}
        fps={30}
        totalFrames={0}
      />,
    );

    expect(
      screen.getByText('Add a video track to start editing'),
    ).toBeVisible();
    expect(screen.getByTestId('mock-player')).toHaveAttribute(
      'data-props',
      expect.stringContaining('"durationInFrames":1'),
    );
    expect(screen.getByTestId('mock-player')).toHaveAttribute(
      'data-props',
      expect.stringContaining('"compositionWidth":1920'),
    );
  });

  it('renders video, text, and audio tracks with filters and volumes', () => {
    render(
      <EditorPreview
        tracks={[
          {
            clips: [
              {
                durationFrames: 90,
                effects: [
                  { intensity: 50, type: 'blur' },
                  { intensity: 75, type: 'brightness' },
                  { intensity: 60, type: 'contrast' },
                  { intensity: 25, type: 'saturation' },
                  { intensity: 40, type: 'grayscale' },
                  { intensity: 30, type: 'sepia' },
                  { intensity: 100, type: 'unknown-effect' },
                ],
                id: 'video-clip',
                ingredientUrl: 'https://example.test/video.mp4',
                sourceEndFrame: 120,
                sourceStartFrame: 15,
                startFrame: 10,
                volume: 80,
              },
            ],
            id: 'video-track',
            isMuted: false,
            name: 'Video',
            type: EditorTrackType.VIDEO,
            volume: 100,
          },
          {
            clips: [
              {
                durationFrames: 60,
                effects: [],
                id: 'text-clip',
                ingredientUrl: '',
                sourceEndFrame: 60,
                sourceStartFrame: 0,
                startFrame: 20,
                textOverlay: {
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  color: '#fff',
                  fontFamily: 'Inter',
                  fontSize: 42,
                  fontWeight: 800,
                  position: { x: 30, y: 40 },
                  text: 'Launch story',
                },
              },
              {
                durationFrames: 30,
                effects: [],
                id: 'text-without-overlay',
                ingredientUrl: '',
                sourceEndFrame: 30,
                sourceStartFrame: 0,
                startFrame: 70,
              },
            ],
            id: 'text-track',
            isMuted: false,
            name: 'Text',
            type: EditorTrackType.TEXT,
            volume: 100,
          },
          {
            clips: [
              {
                durationFrames: 120,
                effects: [],
                id: 'audio-clip',
                ingredientUrl: 'https://example.test/audio.mp3',
                sourceEndFrame: 150,
                sourceStartFrame: 30,
                startFrame: 0,
                volume: 50,
              },
            ],
            id: 'audio-track',
            isMuted: false,
            name: 'Audio',
            type: EditorTrackType.AUDIO,
            volume: 60,
          },
          {
            clips: [
              {
                durationFrames: 30,
                effects: [],
                id: 'muted-video',
                ingredientUrl: 'https://example.test/muted.mp4',
                sourceEndFrame: 30,
                sourceStartFrame: 0,
                startFrame: 0,
              },
            ],
            id: 'muted-track',
            isMuted: true,
            name: 'Muted',
            type: EditorTrackType.VIDEO,
            volume: 100,
          },
        ]}
        width={1080}
        height={1920}
        fps={24}
        totalFrames={240}
      />,
    );

    expect(screen.getByText('Launch story')).toHaveStyle({
      color: '#fff',
      fontFamily: 'Inter',
      fontSize: '42px',
      left: '30%',
      top: '40%',
    });

    const videoProps = JSON.parse(
      screen.getByTestId('video').getAttribute('data-props') ?? '{}',
    );
    expect(videoProps).toMatchObject({
      endAt: 120,
      src: 'https://example.test/video.mp4',
      startFrom: 15,
      volume: 0.8,
    });

    const filteredFill = screen
      .getAllByTestId('absolute-fill')
      .find((element) => element.style.filter.includes('blur'));
    expect(filteredFill).toHaveStyle({
      filter:
        'blur(10px) brightness(150%) contrast(120%) saturate(50%) grayscale(40%) sepia(30%)',
    });

    const audioProps = JSON.parse(
      screen.getByTestId('audio').getAttribute('data-props') ?? '{}',
    );
    expect(audioProps).toMatchObject({
      endAt: 150,
      src: 'https://example.test/audio.mp3',
      startFrom: 30,
      volume: 0.3,
    });
  });

  it('exposes player controls and forwards player events', () => {
    const ref = createRef<EditorPreviewRef>();
    const onFrameChange = vi.fn();
    const onPlayingChange = vi.fn();

    const { unmount } = render(
      <EditorPreview
        ref={ref}
        tracks={[]}
        width={1920}
        height={1080}
        fps={30}
        totalFrames={300}
        onFrameChange={onFrameChange}
        onPlayingChange={onPlayingChange}
      />,
    );

    expect(playerControls.addEventListener).toHaveBeenCalledWith(
      'frameupdate',
      expect.any(Function),
    );
    expect(playerControls.addEventListener).toHaveBeenCalledWith(
      'play',
      expect.any(Function),
    );
    expect(playerControls.addEventListener).toHaveBeenCalledWith(
      'pause',
      expect.any(Function),
    );

    act(() => {
      listeners.get('frameupdate')?.();
      listeners.get('play')?.();
      listeners.get('pause')?.();
    });

    expect(onFrameChange).toHaveBeenCalledWith(42);
    expect(onPlayingChange).toHaveBeenNthCalledWith(1, true);
    expect(onPlayingChange).toHaveBeenNthCalledWith(2, false);

    ref.current?.play();
    ref.current?.pause();
    ref.current?.toggle();
    ref.current?.seekToFrame(120);
    expect(ref.current?.getCurrentFrame()).toBe(42);

    expect(playerControls.play).toHaveBeenCalledTimes(1);
    expect(playerControls.pause).toHaveBeenCalledTimes(1);
    expect(playerControls.toggle).toHaveBeenCalledTimes(1);
    expect(playerControls.seekTo).toHaveBeenCalledWith(120);

    unmount();
    expect(playerControls.removeEventListener).toHaveBeenCalledWith(
      'frameupdate',
      expect.any(Function),
    );
  });
});
