import type { EditorTrackType } from '@genfeedai/enums';
import type {
  IEditorProjectSettings,
  IEditorTrack,
} from './editor-project.interface';

export const EDITOR_EXPORT_CONTRACT_VERSION = 1 as const;
export const EDITOR_RENDERER_VERSION = 'remotion@4.0.486' as const;

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

export interface IEditorRenderJobParams extends IValidatedEditorExportContract {
  rendererVersion: typeof EDITOR_RENDERER_VERSION;
}

export interface IEditorRenderOutputMetadata {
  durationFrames: number;
  durationSeconds: number;
  fps: number;
  height: number;
  rendererVersion: typeof EDITOR_RENDERER_VERSION;
  s3Key: string;
  size: number;
  url: string;
  width: number;
}

export interface IEditorRenderProvenance extends IEditorRenderJobParams {
  completedAt?: string;
  output?: IEditorRenderOutputMetadata;
  queuedAt: string;
}
