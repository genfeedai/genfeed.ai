import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { StudioPlaygroundReferenceRole } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';

/** Stable attachment identity, independent of its current positional token. */
export interface StudioReferenceMentionSource {
  key: string;
  order?: number;
  id?: string;
  kind: 'image' | 'video' | 'audio';
  name: string;
  previewUrl?: string;
  role: StudioPlaygroundReferenceRole;
  source: 'upload' | 'library';
}

export interface StudioAttachedReference extends StudioReferenceMentionSource {
  id: string;
}

export interface StudioReferenceMention extends StudioAttachedReference {
  token: string;
}

export interface StudioReferenceMentionValidation {
  errors: string[];
  unusedTokens: string[];
}

/** Minimal editor projection; keeps shared validation independent of TipTap. */
export interface StudioReferenceMentionDocument {
  attrs?: { key?: unknown; id?: unknown; label?: unknown };
  content?: StudioReferenceMentionDocument[];
  type?: string;
}

/** Raw ordered arrays, before generation-brief deduplication or provider limits. */
export interface StudioVideoReferenceMentionBindingInput {
  audioReferenceIds?: readonly string[];
  endFrameId?: string;
  hasEditMask?: boolean;
  imageReferenceIds?: readonly string[];
  model: string;
  runReferences?: readonly GenerationBriefReference[];
  text: string;
  videoReferenceIds?: readonly string[];
}

export interface StudioReferenceMentionInvariantInput {
  originalText: string;
  preparedText: string;
}
