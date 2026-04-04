import type { IEditorTrack } from '@genfeedai/interfaces';

export interface EditorPreviewProps {
  tracks: IEditorTrack[];
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  onFrameChange?: (frame: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}
