import type { IEditorTrack } from '@genfeedai/contracts/interfaces';

export interface EditorTextTrackListProps {
  textTracks: IEditorTrack[];
  fps: number;
  selectedClipId: string | null;
  onClipSelect: (trackId: string, clipId: string) => void;
  onDeleteTrack: (trackId: string) => void;
}
