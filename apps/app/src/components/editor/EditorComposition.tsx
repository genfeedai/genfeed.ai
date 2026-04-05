'use client';

import { AbsoluteFill, Img, OffthreadVideo, Sequence } from 'remotion';
import { getCompositionDurationInFrames } from '@/lib/editor/composition';
import type { EditorComposition as EditorCompositionType } from '@/lib/editor/types';

interface EditorCompositionProps {
  composition?: EditorCompositionType;
}

export function EditorComposition({ composition }: EditorCompositionProps) {
  if (!composition) {
    return <AbsoluteFill style={{ backgroundColor: '#050816' }} />;
  }

  let currentFrom = 0;
  const totalFrames = getCompositionDurationInFrames(composition);

  return (
    <AbsoluteFill style={{ backgroundColor: '#050816', color: 'white', overflow: 'hidden' }}>
      {composition.items.map((item) => {
        const from = currentFrom;
        currentFrom += item.durationInFrames;
        const source = `/api/gallery/${item.path}`;

        return (
          <Sequence key={item.id} from={from} durationInFrames={item.durationInFrames}>
            <AbsoluteFill
              style={{ alignItems: 'center', display: 'flex', justifyContent: 'center' }}
            >
              {item.mediaType === 'video' ? (
                <OffthreadVideo
                  src={source}
                  startFrom={item.trimStart}
                  endAt={item.trimEnd ? item.durationInFrames - item.trimEnd : undefined}
                  style={{ height: '100%', objectFit: 'cover', width: '100%' }}
                />
              ) : (
                <Img src={source} style={{ height: '100%', objectFit: 'cover', width: '100%' }} />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {composition.overlay?.text ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 48 }}>
          <div
            style={{
              alignSelf: 'center',
              background: 'rgba(0,0,0,0.56)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 24,
              fontSize: 54,
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: totalFrames > composition.fps * 4 ? 56 : 24,
              maxWidth: '82%',
              padding: '20px 28px',
              textAlign: 'center',
            }}
          >
            {composition.overlay.text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}
