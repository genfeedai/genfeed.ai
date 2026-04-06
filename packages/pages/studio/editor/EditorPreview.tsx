'use client';

import { EditorTrackType } from '@genfeedai/enums';
import type { IEditorEffect, IEditorTrack } from '@genfeedai/interfaces';
import type { EditorPreviewProps } from '@props/studio/editor-preview.props';
import type { Player, PlayerRef } from '@remotion/player';
import dynamic from 'next/dynamic';
import {
  forwardRef,
  useCallback,
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
  useVideoConfig,
} from 'remotion';

function buildCssFilter(effects: IEditorEffect[]): string {
  if (!effects || effects.length === 0) return 'none';

  const filters: string[] = [];
  for (const effect of effects) {
    switch (effect.type) {
      case 'blur':
        // intensity 0-100 maps to 0-20px blur
        filters.push(`blur(${(effect.intensity / 100) * 20}px)`);
        break;
      case 'brightness':
        // intensity 0-100 maps to 0-200% brightness (50 = 100% = normal)
        filters.push(`brightness(${(effect.intensity / 50) * 100}%)`);
        break;
      case 'contrast':
        // intensity 0-100 maps to 0-200% contrast (50 = 100% = normal)
        filters.push(`contrast(${(effect.intensity / 50) * 100}%)`);
        break;
      case 'saturation':
        // intensity 0-100 maps to 0-200% saturation (50 = 100% = normal)
        filters.push(`saturate(${(effect.intensity / 50) * 100}%)`);
        break;
      case 'grayscale':
        filters.push(`grayscale(${effect.intensity}%)`);
        break;
      case 'sepia':
        filters.push(`sepia(${effect.intensity}%)`);
        break;
    }
  }

  return filters.length > 0 ? filters.join(' ') : 'none';
}

const RemotionPlayer = dynamic(
  () => import('@remotion/player').then((mod) => mod.Player),
  {
    loading: () => (
      <div className="flex items-center justify-center w-full h-full min-h-[200px] bg-black/50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
          <span className="text-xs text-muted-foreground">Loading player…</span>
        </div>
      </div>
    ),
    ssr: false,
  },
) as typeof Player;

interface EditorCompositionProps {
  tracks: IEditorTrack[];
}

function EditorComposition({ tracks }: EditorCompositionProps) {
  const { fps } = useVideoConfig();

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
          backgroundColor: '#000',
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
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Render video tracks */}
      {videoTracks.map((track) =>
        track.clips.map((clip) => {
          const cssFilter = buildCssFilter(clip.effects);
          return (
            <Sequence
              key={clip.id}
              from={clip.startFrame}
              durationInFrames={clip.durationFrames}
            >
              <AbsoluteFill
                style={cssFilter !== 'none' ? { filter: cssFilter } : undefined}
              >
                <OffthreadVideo
                  src={clip.ingredientUrl}
                  startFrom={clip.sourceStartFrame}
                  endAt={clip.sourceEndFrame}
                  volume={track.isMuted ? 0 : (clip.volume ?? 100) / 100}
                  style={{
                    height: '100%',
                    objectFit: 'contain',
                    width: '100%',
                  }}
                />
              </AbsoluteFill>
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
              <AbsoluteFill
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    backgroundColor: clip.textOverlay.backgroundColor,
                    color: clip.textOverlay.color,
                    fontFamily: clip.textOverlay.fontFamily || 'Arial',
                    fontSize: clip.textOverlay.fontSize,
                    fontWeight: clip.textOverlay.fontWeight || 700,
                    left: `${clip.textOverlay.position.x}%`,
                    padding: clip.textOverlay.padding || 8,
                    position: 'absolute',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                    top: `${clip.textOverlay.position.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  {clip.textOverlay.text}
                </div>
              </AbsoluteFill>
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
              startFrom={clip.sourceStartFrame}
              endAt={clip.sourceEndFrame}
              volume={(track.volume / 100) * ((clip.volume ?? 100) / 100)}
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

export const EditorPreview = forwardRef<EditorPreviewRef, EditorPreviewProps>(
  function EditorPreview(
    { tracks, width, height, fps, totalFrames, onFrameChange, onPlayingChange },
    ref,
  ) {
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

    const handleFrameUpdate = useCallback(() => {
      const frame = playerRef.current?.getCurrentFrame() ?? 0;
      onFrameChangeRef.current?.(frame);
    }, []);

    const handlePlay = useCallback(() => {
      setIsPlaying(true);
      onPlayingChangeRef.current?.(true);
    }, []);

    const handlePause = useCallback(() => {
      setIsPlaying(false);
      onPlayingChangeRef.current?.(false);
    }, []);

    useEffect(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      player.addEventListener('frameupdate', handleFrameUpdate);
      player.addEventListener('play', handlePlay);
      player.addEventListener('pause', handlePause);

      return () => {
        player.removeEventListener('frameupdate', handleFrameUpdate);
        player.removeEventListener('play', handlePlay);
        player.removeEventListener('pause', handlePause);
      };
    }, [handleFrameUpdate, handlePlay, handlePause]);

    // Calculate aspect ratio for container
    const aspectRatio = width / height;

    return (
      <div className="relative w-full bg-black overflow-hidden">
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
            inputProps={{ tracks }}
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
  },
);

export default EditorPreview;
