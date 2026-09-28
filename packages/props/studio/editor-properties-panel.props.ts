import type { IEditorTrack } from '@genfeedai/contracts/interfaces';

export interface EditorPropertiesPanelProps {
  tracks: IEditorTrack[];
  fps: number;
  isReadOnly?: boolean;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
}
