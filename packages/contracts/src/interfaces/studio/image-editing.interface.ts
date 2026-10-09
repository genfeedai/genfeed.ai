import type { RouterPriority } from '../..';
import type { ImageEditSize } from '../../constants/image-edit-sizes.constant';

/** Persisted recipe contains owned asset IDs, never provider URLs or credentials. */
export interface ImageEditingRecipe {
  contractVersion: string;
  operation: 'image-edit';
  model: string;
  sourceIds: string[];
  maskId?: string;
  size?: ImageEditSize;
  quality?: 'medium';
  resolution?: string;
  aspectRatio?: string;
  grounding?: false;
  outputs: number;
  seed?: number;
}

export interface ImageEditingPayload {
  autoSelectModel?: boolean;
  prioritize?: RouterPriority;
  prompt: string;
  brand?: string;
  model?: string;
  references?: string[];
  maskId?: string;
  size?: ImageEditSize;
  resolution?: string;
  aspectRatio?: string;
  outputs?: number;
  seed?: number;
  sourceActionId?: string;
  waitForCompletion?: boolean;
}
