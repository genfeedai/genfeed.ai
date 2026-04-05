import { Composition, registerRoot } from 'remotion';
import { EditorComposition } from '@/components/editor/EditorComposition';
import {
  createCompositionFromLaunchContext,
  EDITOR_FPS,
  getCompositionDurationInFrames,
} from '@/lib/editor/composition';
import type {
  EditorComposition as EditorCompositionType,
  EditorLaunchContext,
} from '@/lib/editor/types';

interface RootProps {
  composition?: EditorCompositionType;
  launchContext?: EditorLaunchContext;
}

const fallbackComposition = createCompositionFromLaunchContext({ assetPaths: [] });

export const REMOTION_COMPOSITION_ID = 'CoreEditorComposition';

export function RemotionRoot() {
  return (
    <Composition
      id={REMOTION_COMPOSITION_ID}
      component={EditorComposition}
      fps={EDITOR_FPS}
      width={fallbackComposition.width}
      height={fallbackComposition.height}
      durationInFrames={getCompositionDurationInFrames(fallbackComposition)}
      defaultProps={{ composition: fallbackComposition } satisfies RootProps}
      calculateMetadata={({ props }: { props: RootProps }) => {
        const composition = props.composition ?? fallbackComposition;

        return {
          durationInFrames: getCompositionDurationInFrames(composition),
          fps: composition.fps,
          height: composition.height,
          width: composition.width,
        };
      }}
    />
  );
}

registerRoot(RemotionRoot);
