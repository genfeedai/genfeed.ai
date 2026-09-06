import type { IEditorTrack } from '@genfeedai/contracts/interfaces';

export interface EditorTextPanelProps {
  tracks: IEditorTrack[];
  fps: number;
  totalFrames: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onAddTextTrack: (track: IEditorTrack) => void;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
  onClipSelect: (trackId: string, clipId: string) => void;
}
