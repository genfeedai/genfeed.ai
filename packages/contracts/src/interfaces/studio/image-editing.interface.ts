import type { ImageEditSize } from '../../constants/image-edit-models.constant';

/** Persisted recipe contains owned asset IDs, never provider URLs or credentials. */
export interface ImageEditingRecipe {
  contractVersion: string;
  operation: 'image-edit';
  model: string;
  sourceIds: string[];
  maskId?: string;
  size: ImageEditSize;
  quality: 'medium';
  outputs: number;
  seed?: number;
}

export interface ImageEditingPayload {
  prompt: string;
  brand?: string;
  model?: string;
  references?: string[];
  maskId?: string;
  size?: ImageEditSize;
  outputs?: number;
  seed?: number;
  sourceActionId?: string;
  waitForCompletion?: boolean;
}
