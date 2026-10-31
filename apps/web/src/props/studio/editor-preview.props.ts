import type { IEditorTrack } from '@genfeedai/contracts/interfaces';
import type { Player, PlayerRef } from '@remotion/player';
import type { ComponentProps, ComponentType, Ref } from 'react';

export interface EditorCompositionProps extends Record<string, unknown> {
  backgroundColor: string;
  tracks: IEditorTrack[];
}

export type EditorPreviewPlayerProps = Omit<
  ComponentProps<typeof Player>,
  'component' | 'inputProps'
> & {
  component: ComponentType<EditorCompositionProps>;
  inputProps: EditorCompositionProps;
  ref?: Ref<PlayerRef>;
};

export interface EditorPreviewRef {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seekToFrame: (frame: number) => void;
  getCurrentFrame: () => number;
}

export interface EditorPreviewProps {
  backgroundColor?: string;
  tracks: IEditorTrack[];
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  onFrameChange?: (frame: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}
