import { mediaModerationRecordSchema } from '@genfeedai/contracts/api-types/contracts';
import type { IMediaModeration } from '@genfeedai/contracts/interfaces';

export const MEDIA_MODERATION_SELECT = {
  assetHash: true,
  candidateVerdict: true,
  createdAt: true,
  id: true,
  ingredientId: true,
  inputs: true,
  mode: true,
  organizationId: true,
  provider: true,
  reusedFromId: true,
  thresholds: true,
  updatedAt: true,
  verdict: true,
} as const;

export type MediaModerationRow = {
  assetHash: string;
  candidateVerdict: unknown;
  createdAt: Date;
  id: string;
  ingredientId: string;
  inputs: unknown;
  mode: string;
  organizationId: string;
  provider: string;
  reusedFromId: string | null;
  thresholds: unknown;
  updatedAt: Date;
  verdict: unknown;
};

/** Validate a persisted row; one that no longer parses reads as absent. */
export function toMediaModeration(
  row: MediaModerationRow,
): IMediaModeration | null {
  const parsed = mediaModerationRecordSchema.safeParse({
    assetHash: row.assetHash,
    candidateVerdict: row.candidateVerdict,
    inputs: row.inputs,
    mode: row.mode,
    provider: row.provider,
    thresholds: row.thresholds,
    verdict: row.verdict,
  });
  if (!parsed.success) {
    return null;
  }
  return {
    ...parsed.data,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    ingredientId: row.ingredientId,
    organizationId: row.organizationId,
    reusedFromId: row.reusedFromId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
