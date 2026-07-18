import type { EditorTrackType } from '@genfeedai/enums';
import type {
  IEditorProjectSettings,
  IEditorTrack,
} from './editor-project.interface';

export const EDITOR_EXPORT_CONTRACT_VERSION = 1 as const;

export interface IEditorExportAssetReference {
  clipId: string;
  ingredientId: string;
  ingredientUrl: string;
  trackId: string;
  type: Exclude<EditorTrackType, EditorTrackType.TEXT>;
}

export interface IEditorExportCompositionSnapshot {
  projectId: string;
  settings: IEditorProjectSettings;
  totalDurationFrames: number;
  tracks: IEditorTrack[];
  version: typeof EDITOR_EXPORT_CONTRACT_VERSION;
}

export interface IValidatedEditorExportContract {
  assetManifest: IEditorExportAssetReference[];
  snapshot: IEditorExportCompositionSnapshot;
}
