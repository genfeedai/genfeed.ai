import type { EditorEffectType } from '@genfeedai/contracts';
import type { IEditorTrack } from '@genfeedai/contracts/interfaces';

export interface EditorEffectsPanelProps {
  tracks: IEditorTrack[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onTrackUpdate: (trackId: string, updates: Partial<IEditorTrack>) => void;
}

export interface EffectConfig {
  type: EditorEffectType;
  label: string;
  description: string;
  defaultIntensity: number;
}
