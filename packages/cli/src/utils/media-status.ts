import { IngredientStatus } from '@genfeedai/contracts';
import type { Image } from '@/api/images';

export type MediaObservation = Pick<Image, 'id' | 'status' | 'error'>;

export const MEDIA_SUCCESS_STATUSES: ReadonlySet<IngredientStatus> = new Set([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

export const MEDIA_IN_PROGRESS_STATUSES: ReadonlySet<IngredientStatus> = new Set([
  IngredientStatus.DRAFT,
  IngredientStatus.PROCESSING,
]);
