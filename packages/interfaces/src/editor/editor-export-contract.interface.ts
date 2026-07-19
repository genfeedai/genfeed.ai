import type { EditorTrackType } from '@genfeedai/enums';
import type {
  IEditorProjectSettings,
  IEditorTrack,
} from './editor-project.interface';

export const EDITOR_EXPORT_CONTRACT_VERSION = 1 as const;
export const EDITOR_RENDERER_VERSION = 'remotion@4.0.486' as const;
export const EDITOR_RENDER_TIMEOUT_MS = 15 * 60 * 1000;

export type EditorRenderTerminalReason =
  | 'asset_unavailable'
  | 'cancelled'
  | 'renderer_failed'
  | 'timed_out'
  | 'worker_lost';

export interface IEditorRenderFailure {
  attempt: number;
  failedAt: string;
  reason: EditorRenderTerminalReason;
}

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

export interface IEditorRenderCorrelation {
  authProviderUserId: string;
  cancelRequestedAt?: string;
  ingredientId: string;
  jobId: string;
  metadataId: string;
  projectId: string;
  room: string;
}

export interface IEditorRenderProvenance extends IEditorRenderJobParams {
  completedAt?: string;
  failure?: IEditorRenderFailure;
  job?: IEditorRenderCorrelation;
  output?: IEditorRenderOutputMetadata;
  queuedAt: string;
}

export function parseEditorRenderOutputMetadata(
  result: unknown,
): IEditorRenderOutputMetadata {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Editor renderer returned an invalid result.');
  }

  const output = result as Record<string, unknown>;
  const requiredNumbers = [
    'durationFrames',
    'durationSeconds',
    'fps',
    'height',
    'size',
    'width',
  ] as const;
  const requiredStrings = ['s3Key', 'url'] as const;

  if (
    output.rendererVersion !== EDITOR_RENDERER_VERSION ||
    requiredNumbers.some(
      (key) =>
        typeof output[key] !== 'number' ||
        !Number.isFinite(output[key] as number),
    ) ||
    requiredStrings.some((key) => typeof output[key] !== 'string')
  ) {
    throw new Error('Editor renderer returned incomplete output metadata.');
  }

  return {
    durationFrames: output.durationFrames as number,
    durationSeconds: output.durationSeconds as number,
    fps: output.fps as number,
    height: output.height as number,
    rendererVersion: EDITOR_RENDERER_VERSION,
    s3Key: output.s3Key as string,
    size: output.size as number,
    url: output.url as string,
    width: output.width as number,
  };
}
