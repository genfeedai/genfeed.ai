'use client';

import { EditorTrackType } from '@genfeedai/enums';
import type { IEditorClip, IEditorTrack } from '@genfeedai/interfaces';
import { buildEditorRenderStyle } from '@genfeedai/utils/media/editor-render-style.util';
import type { EditorPreviewProps } from '@props/studio/editor-preview.props';
import { Player, type PlayerRef } from '@remotion/player';
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

interface EditorCompositionProps extends Record<string, unknown> {
  backgroundColor: string;
  tracks: IEditorTrack[];
}

type EditorPreviewPlayerProps = Omit<
  ComponentProps<typeof Player>,
  'component' | 'inputProps'
> & {
  component: ComponentType<EditorCompositionProps>;
  inputProps: EditorCompositionProps;
  ref?: Ref<PlayerRef>;
};

function RemotionPlayer({
  component,
  inputProps,
  ref,
  ...props
}: EditorPreviewPlayerProps) {
  return (
    <Player
      ref={ref}
      {...props}
      component={component as never}
      inputProps={inputProps as never}
    />
  );
}

function VisualLayer({
  children,
  clip,
}: {
  children: ReactNode;
  clip: IEditorClip;
}) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={buildEditorRenderStyle(frame, clip)}>
      {children}
    </AbsoluteFill>
  );
}

function EditorComposition({
  backgroundColor,
  tracks,
}: EditorCompositionProps) {
  useVideoConfig();

  const videoTracks = tracks.filter(
    (track) => track.type === EditorTrackType.VIDEO && !track.isMuted,
  );
  const textTracks = tracks.filter(
    (track) => track.type === EditorTrackType.TEXT && !track.isMuted,
  );
  const audioTracks = tracks.filter(
    (track) => track.type === EditorTrackType.AUDIO && !track.isMuted,
  );

  if (tracks.length === 0) {
    return (
      <AbsoluteFill
        style={{
          alignItems: 'center',
          backgroundColor: '#0a0a0f',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: '#666', fontSize: 18, textAlign: 'center' }}>
          <div>Add a video track to start editing</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>
            Audio and text layers can be added once the project is open.
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Render video tracks */}
      {videoTracks.map((track) =>
        track.clips.map((clip) => {
          return (
            <Sequence
              key={clip.id}
              from={clip.startFrame}
              durationInFrames={clip.durationFrames}
            >
              <VisualLayer clip={clip}>
                <OffthreadVideo
                  src={clip.ingredientUrl}
                  style={{
                    height: '100%',
                    objectFit: 'contain',
                    width: '100%',
                  }}
                  trimAfter={clip.sourceEndFrame}
                  trimBefore={clip.sourceStartFrame}
                  volume={
                    track.isMuted
                      ? 0
                      : (track.volume / 100) * ((clip.volume ?? 100) / 100)
                  }
                />
              </VisualLayer>
            </Sequence>
          );
        }),
      )}

      {/* Render text tracks */}
      {textTracks.map((track) =>
        track.clips.map((clip) => {
          if (!clip.textOverlay) {
            return null;
          }
          return (
            <Sequence
              key={clip.id}
              from={clip.startFrame}
              durationInFrames={clip.durationFrames}
            >
              <VisualLayer clip={clip}>
                <div
                  style={{
                    backgroundColor: clip.textOverlay.backgroundColor,
                    color: clip.textOverlay.color,
                    fontFamily: clip.textOverlay.fontFamily ?? 'Arial',
                    fontSize: clip.textOverlay.fontSize,
                    fontWeight: clip.textOverlay.fontWeight ?? 700,
                    left: `${clip.textOverlay.position.x}%`,
                    padding: clip.textOverlay.padding ?? 8,
                    position: 'absolute',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                    top: `${clip.textOverlay.position.y}%`,
                    transform: 'translate(-50%, -50%)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {clip.textOverlay.text}
                </div>
              </VisualLayer>
            </Sequence>
          );
        }),
      )}

      {/* Render audio tracks */}
      {audioTracks.map((track) =>
        track.clips.map((clip) => (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationFrames}
          >
            <Audio
              src={clip.ingredientUrl}
              trimAfter={clip.sourceEndFrame}
              trimBefore={clip.sourceStartFrame}
              volume={
                track.isMuted
                  ? 0
                  : (track.volume / 100) * ((clip.volume ?? 100) / 100)
              }
            />
          </Sequence>
        )),
      )}
    </AbsoluteFill>
  );
}

export interface EditorPreviewRef {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToFrame: (frame: number) => void;
  getCurrentFrame: () => number;
}

function EditorPreview({
  backgroundColor = '#0a0a0f',
  tracks,
  width,
  height,
  fps,
  totalFrames,
  onFrameChange,
  onPlayingChange,
  ref,
}: EditorPreviewProps & { ref?: Ref<EditorPreviewRef> }) {
  const playerRef = useRef<PlayerRef>(null);
  const [_isPlaying, setIsPlaying] = useState(false);
  const onFrameChangeRef = useRef(onFrameChange);
  onFrameChangeRef.current = onFrameChange;
  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;

  useImperativeHandle(ref, () => ({
    getCurrentFrame: () => playerRef.current?.getCurrentFrame() ?? 0,
    pause: () => playerRef.current?.pause(),
    play: () => playerRef.current?.play(),
    seekToFrame: (frame: number) => playerRef.current?.seekTo(frame),
    toggle: () => playerRef.current?.toggle(),
  }));

  const handleFrameUpdateRef = useRef(() => {
    const frame = playerRef.current?.getCurrentFrame() ?? 0;
    onFrameChangeRef.current?.(frame);
  });

  const handlePlayRef = useRef(() => {
    setIsPlaying(true);
    onPlayingChangeRef.current?.(true);
  });

  const handlePauseRef = useRef(() => {
    setIsPlaying(false);
    onPlayingChangeRef.current?.(false);
  });

  useEffect(() => {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const onFrameUpdate = () => handleFrameUpdateRef.current();
    const onPlay = () => handlePlayRef.current();
    const onPause = () => handlePauseRef.current();

    player.addEventListener('frameupdate', onFrameUpdate);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);

    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, []);

  // Calculate aspect ratio for container
  const aspectRatio = width / height;

  return (
    <div className="relative w-full bg-neutral-950 overflow-hidden">
      <div
        className="relative mx-auto"
        style={{
          aspectRatio: aspectRatio.toString(),
          maxWidth: '100%',
        }}
      >
        <RemotionPlayer
          ref={playerRef}
          component={EditorComposition}
          inputProps={{ backgroundColor, tracks }}
          compositionWidth={width}
          compositionHeight={height}
          durationInFrames={Math.max(1, totalFrames)}
          fps={fps}
          style={{
            height: '100%',
            width: '100%',
          }}
          controls={false}
          loop={false}
          clickToPlay={false}
        />
      </div>
    </div>
  );
}

export default EditorPreview;
