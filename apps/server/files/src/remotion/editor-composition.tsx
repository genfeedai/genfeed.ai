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

const CSS_FILTER_BUILDERS: Partial<
  Record<IEditorEffect['type'], (intensity: number) => string>
> = {
  blur: (intensity) => `blur(${(intensity / 100) * 20}px)`,
  brightness: (intensity) => `brightness(${(intensity / 50) * 100}%)`,
  contrast: (intensity) => `contrast(${(intensity / 50) * 100}%)`,
  grayscale: (intensity) => `grayscale(${intensity}%)`,
  saturation: (intensity) => `saturate(${(intensity / 50) * 100}%)`,
  sepia: (intensity) => `sepia(${intensity}%)`,
};

export function buildCssFilter(effects: IEditorEffect[]): string {
  const filters = effects.flatMap((effect) => {
    const builder = CSS_FILTER_BUILDERS[effect.type];
    return builder ? [builder(effect.intensity)] : [];
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

export function buildTransitionStyle(
  frame: number,
  clip: IEditorClip,
): CSSProperties {
  const transitions = [
    {
      direction: 'in' as const,
      progress: transitionProgress(
        frame,
        clip.transitionIn,
        'in',
        clip.durationFrames,
      ),
      transition: clip.transitionIn,
    },
    {
      direction: 'out' as const,
      progress: transitionProgress(
        frame,
        clip.transitionOut,
        'out',
        clip.durationFrames,
      ),
      transition: clip.transitionOut,
    },
  ];
  let opacity = 1;
  let wipeLeft = 0;
  let wipeRight = 0;
  const transforms: string[] = [];

  for (const { direction, progress, transition } of transitions) {
    if (!transition || transition.type === 'none') {
      continue;
    }

    const visibleProgress = direction === 'in' ? progress : 1 - progress;
    if (transition.type === 'fade' || transition.type === 'dissolve') {
      opacity = Math.min(opacity, visibleProgress);
    } else if (transition.type === 'slide') {
      const offset =
        direction === 'in' ? (1 - progress) * 100 : -progress * 100;
      transforms.push(`translateX(${offset}%)`);
    } else if (transition.type === 'wipe') {
      if (direction === 'in') {
        wipeRight = Math.max(wipeRight, (1 - progress) * 100);
      } else {
        wipeLeft = Math.max(wipeLeft, progress * 100);
      }
    }
  }

  return {
    ...(opacity < 1 ? { opacity } : {}),
    ...(transforms.length > 0 ? { transform: transforms.join(' ') } : {}),
    ...(wipeLeft > 0 || wipeRight > 0
      ? { clipPath: `inset(0 ${wipeRight}% 0 ${wipeLeft}%)` }
      : {}),
  };
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
    ...buildTransitionStyle(frame, clip),
  };

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
