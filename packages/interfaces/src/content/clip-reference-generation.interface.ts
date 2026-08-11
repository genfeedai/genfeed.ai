import type { CLIP_REFERENCE_FRAME_SCHEMA_VERSION } from './clip-reference-frame.interface';
import type { ClipResultMode } from './clip-terminal-contract.interface';

export const CLIP_REFERENCE_POLICIES = ['guided', 'strict'] as const;

export type ClipReferencePolicy = (typeof CLIP_REFERENCE_POLICIES)[number];

export const DEFAULT_CLIP_REFERENCE_POLICY: ClipReferencePolicy = 'guided';

export interface ClipReferenceProvenance {
  schemaVersion: typeof CLIP_REFERENCE_FRAME_SCHEMA_VERSION;
  source: {
    candidateId: string;
    timestampSeconds: number;
    assetId?: string;
    storageKey?: string;
    mimeType?: string;
  };
  application: {
    mode: ClipResultMode;
    provider: string;
    state: 'applied' | 'degraded';
    nativeField?: string;
    reason?: string;
  };
}

export interface ClipReferenceApplication {
  state: 'applied' | 'degraded';
  reason?: string;
  provenance: ClipReferenceProvenance;
}
