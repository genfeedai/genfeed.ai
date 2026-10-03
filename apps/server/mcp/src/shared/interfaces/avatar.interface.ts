import type { IngredientOrigin } from '@genfeedai/contracts';

export interface AvatarResponse {
  id: string;
  name: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  gender?: string;
  style?: string;
  age?: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: string;
  /** Permanent origin: UPLOADED, GENERATED, IMPORTED or UNKNOWN. */
  origin?: string;
}

export interface AvatarListParams {
  limit?: number;
  offset?: number;
  /** Only assets with this origin. */
  origin?: IngredientOrigin;
}
