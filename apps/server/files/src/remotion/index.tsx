import type { IEditorExportCompositionSnapshot } from '@genfeedai/interfaces';
import { Composition, registerRoot } from 'remotion';
import {
  EditorComposition,
  type EditorCompositionProps,
} from './editor-composition';

const placeholderSnapshot = {
  projectId: 'placeholder',
  settings: {
    backgroundColor: '#000000',
    format: 'landscape',
    fps: 30,
    height: 1080,
    width: 1920,
  },
  totalDurationFrames: 1,
  tracks: [],
  version: 1,
} as unknown as IEditorExportCompositionSnapshot;

function RemotionRoot() {
  return (
    <Composition
      calculateMetadata={({ props }) => ({
        durationInFrames: props.snapshot.totalDurationFrames,
        fps: props.snapshot.settings.fps,
        height: props.snapshot.settings.height,
        props,
        width: props.snapshot.settings.width,
      })}
      component={EditorComposition}
      defaultProps={{ snapshot: placeholderSnapshot }}
      durationInFrames={1}
      fps={30}
      height={1080}
      id="EditorComposition"
      width={1920}
    />
  );
}

registerRoot(RemotionRoot);

export type { EditorCompositionProps };
