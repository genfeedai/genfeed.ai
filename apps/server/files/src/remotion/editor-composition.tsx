import type {
  IEditorClip,
  IEditorEffect,
  IEditorExportCompositionSnapshot,
  IEditorTransition,
} from '@genfeedai/interfaces';
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from 'remotion';

export interface EditorCompositionProps extends Record<string, unknown> {
  snapshot: IEditorExportCompositionSnapshot;
}

function buildCssFilter(effects: IEditorEffect[]): string {
  const filters = effects.flatMap((effect) => {
    switch (effect.type) {
      case 'blur':
        return [`blur(${(effect.intensity / 100) * 20}px)`];
      case 'brightness':
        return [`brightness(${(effect.intensity / 50) * 100}%)`];
      case 'contrast':
        return [`contrast(${(effect.intensity / 50) * 100}%)`];
      case 'saturation':
        return [`saturate(${(effect.intensity / 50) * 100}%)`];
      case 'grayscale':
        return [`grayscale(${effect.intensity}%)`];
      case 'sepia':
        return [`sepia(${effect.intensity}%)`];
      default:
        return [];
    }
  });

  return filters.length === 0 ? 'none' : filters.join(' ');
}

function transitionProgress(
  frame: number,
  transition: IEditorTransition | undefined,
  direction: 'in' | 'out',
  durationInFrames: number,
): number {
  if (!transition || transition.type === 'none' || transition.duration === 0) {
    return direction === 'in' ? 1 : 0;
  }

  if (direction === 'in') {
    return interpolate(frame, [0, transition.duration], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  return interpolate(
    frame,
    [durationInFrames - transition.duration, durationInFrames],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  );
}

function applyTransition(
  style: CSSProperties,
  transition: IEditorTransition | undefined,
  progress: number,
  direction: 'in' | 'out',
): void {
  if (!transition || transition.type === 'none') {
    return;
  }

  const visibleProgress = direction === 'in' ? progress : 1 - progress;
  switch (transition.type) {
    case 'fade':
    case 'dissolve':
      style.opacity = Math.min(
        typeof style.opacity === 'number' ? style.opacity : 1,
        visibleProgress,
      );
      break;
    case 'slide':
      style.transform = `translateX(${direction === 'in' ? (1 - progress) * 100 : -progress * 100}%)`;
      break;
    case 'wipe':
      style.clipPath =
        direction === 'in'
          ? `inset(0 ${(1 - progress) * 100}% 0 0)`
          : `inset(0 0 0 ${progress * 100}%)`;
      break;
  }
}

function VisualLayer({
  children,
  clip,
}: {
  children: ReactNode;
  clip: IEditorClip;
}) {
  const frame = useCurrentFrame();
  const style: CSSProperties = {
    filter: buildCssFilter(clip.effects),
  };

  applyTransition(
    style,
    clip.transitionIn,
    transitionProgress(frame, clip.transitionIn, 'in', clip.durationFrames),
    'in',
  );
  applyTransition(
    style,
    clip.transitionOut,
    transitionProgress(frame, clip.transitionOut, 'out', clip.durationFrames),
    'out',
  );

  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}

export function EditorComposition({ snapshot }: EditorCompositionProps) {
  const activeTracks = snapshot.tracks.filter((track) => !track.isMuted);

  return (
    <AbsoluteFill
      style={{ backgroundColor: snapshot.settings.backgroundColor }}
    >
      {activeTracks
        .filter((track) => track.type === 'video')
        .flatMap((track) =>
          track.clips.map((clip) => (
            <Sequence
              key={clip.id}
              durationInFrames={clip.durationFrames}
              from={clip.startFrame}
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
                  volume={(track.volume / 100) * ((clip.volume ?? 100) / 100)}
                />
              </VisualLayer>
            </Sequence>
          )),
        )}

      {activeTracks
        .filter((track) => track.type === 'text')
        .flatMap((track) =>
          track.clips.map((clip) => {
            const overlay = clip.textOverlay;
            if (!overlay) {
              return null;
            }

            return (
              <Sequence
                key={clip.id}
                durationInFrames={clip.durationFrames}
                from={clip.startFrame}
              >
                <VisualLayer clip={clip}>
                  <div
                    style={{
                      backgroundColor: overlay.backgroundColor,
                      color: overlay.color,
                      fontFamily: overlay.fontFamily ?? 'Arial',
                      fontSize: overlay.fontSize,
                      fontWeight: overlay.fontWeight ?? 700,
                      left: `${overlay.position.x}%`,
                      padding: overlay.padding ?? 8,
                      position: 'absolute',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                      top: `${overlay.position.y}%`,
                      transform: 'translate(-50%, -50%)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {overlay.text}
                  </div>
                </VisualLayer>
              </Sequence>
            );
          }),
        )}

      {activeTracks
        .filter((track) => track.type === 'audio')
        .flatMap((track) =>
          track.clips.map((clip) => (
            <Sequence
              key={clip.id}
              durationInFrames={clip.durationFrames}
              from={clip.startFrame}
            >
              <Audio
                src={clip.ingredientUrl}
                trimAfter={clip.sourceEndFrame}
                trimBefore={clip.sourceStartFrame}
                volume={(track.volume / 100) * ((clip.volume ?? 100) / 100)}
              />
            </Sequence>
          )),
        )}
    </AbsoluteFill>
  );
}
