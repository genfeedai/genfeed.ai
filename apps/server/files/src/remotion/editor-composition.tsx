import type {
  IEditorClip,
  IEditorExportCompositionSnapshot,
} from '@genfeedai/interfaces';
import { buildEditorRenderStyle } from '@genfeedai/utils/media/editor-render-style.util';
import type { CSSProperties, ReactNode } from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
} from 'remotion';

export interface EditorCompositionProps extends Record<string, unknown> {
  snapshot: IEditorExportCompositionSnapshot;
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
    ...buildEditorRenderStyle(frame, clip),
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
