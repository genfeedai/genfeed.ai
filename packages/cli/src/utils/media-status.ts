import { IngredientStatus } from '@genfeedai/contracts';
import type { Image } from '@/api/images';

export type MediaObservation = Pick<Image, 'id' | 'status' | 'error'>;

export type MediaUrlRecord = {
  cdnUrl?: string;
  url?: string;
};

export function withPublicMediaUrl<T extends MediaUrlRecord>(record: T): T {
  return { ...record, url: record.url ?? record.cdnUrl };
}

export const MEDIA_SUCCESS_STATUSES: ReadonlySet<IngredientStatus> = new Set([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

export const MEDIA_IN_PROGRESS_STATUSES: ReadonlySet<IngredientStatus> = new Set([
  IngredientStatus.DRAFT,
  IngredientStatus.PROCESSING,
]);
