import type { CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION } from './clipper-reference-frame.interface';
import type { ClipperResultMode } from './clipper-terminal-contract.interface';

export const CLIPPER_REFERENCE_POLICIES = ['guided', 'strict'] as const;

export type ClipperReferencePolicy =
  (typeof CLIPPER_REFERENCE_POLICIES)[number];

export const DEFAULT_CLIP_REFERENCE_POLICY: ClipperReferencePolicy = 'guided';

export interface ClipperReferenceProvenance {
  schemaVersion: typeof CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION;
  source: {
    candidateId: string;
    timestampSeconds: number;
    assetId?: string;
    storageKey?: string;
    mimeType?: string;
  };
  application: {
    mode: ClipperResultMode;
    provider: string;
    state: 'applied' | 'degraded';
    nativeField?: string;
    reason?: string;
  };
}

export interface ClipperReferenceApplication {
  state: 'applied' | 'degraded';
  reason?: string;
  provenance: ClipperReferenceProvenance;
}
