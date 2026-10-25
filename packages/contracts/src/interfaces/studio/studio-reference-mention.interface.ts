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

export interface StudioReferenceMention extends StudioReferenceMentionSource {
  id: string;
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
