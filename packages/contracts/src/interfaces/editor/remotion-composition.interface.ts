import type {
  IEditorProjectSettings,
  IEditorTrack,
} from './editor-project.interface';

export interface IRemotionCompositionInput {
  compositionId: string;
  version: string;
  rendererVersion: string;
  brandId: string;
  requestId: string;
  title: string;
  brandName: string;
  benefits: string[];
  callToAction: string;
  format: 'portrait' | 'landscape' | 'square';
  accentColor: string;
  sourceVideoId?: string;
}

export interface IRemotionCompositionProvenance {
  id: string;
  version: string;
  rendererVersion: string;
  requestId: string;
  inputHash: string;
  sourceAssetIds: string[];
}

export interface IRemotionCompositionProject {
  settings: IEditorProjectSettings;
  totalDurationFrames: number;
  tracks: IEditorTrack[];
}

export interface IRemotionCompositionJob {
  id: string;
  compositionId: string;
  version: string;
  rendererVersion: string;
  status: string;
  progress?: number;
  jobId?: string;
  assetId?: string;
  assetUrl?: string;
  failure?: string;
  sourceAssetIds: string[];
}
