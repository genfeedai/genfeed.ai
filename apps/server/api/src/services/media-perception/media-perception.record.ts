import {
  type MediaPerceptionArtefactStatus,
  type MediaPerceptionRecord,
  mediaPerceptionRecordSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type { IMediaPerception } from '@genfeedai/contracts/interfaces';

/** The columns a perception row is read back with. */
export const MEDIA_PERCEPTION_SELECT = {
  assetHash: true,
  attempts: true,
  audioUrl: true,
  createdAt: true,
  description: true,
  descriptionModel: true,
  descriptionStatus: true,
  diagnostics: true,
  durationSeconds: true,
  frames: true,
  framesStatus: true,
  id: true,
  ingredientId: true,
  kind: true,
  ocr: true,
  ocrStatus: true,
  organizationId: true,
  reusedFromId: true,
  schemaVersion: true,
  transcript: true,
  transcriptStatus: true,
  updatedAt: true,
} as const;

export type MediaPerceptionRow = {
  assetHash: string;
  attempts: number;
  audioUrl: string | null;
  createdAt: Date;
  description: unknown;
  descriptionModel: string | null;
  descriptionStatus: string;
  diagnostics: unknown;
  durationSeconds: number | null;
  frames: unknown;
  framesStatus: string;
  id: string;
  ingredientId: string;
  kind: string;
  ocr: unknown;
  ocrStatus: string;
  organizationId: string;
  reusedFromId: string | null;
  schemaVersion: number;
  transcript: unknown;
  transcriptStatus: string;
  updatedAt: Date;
};

/**
 * Validate a persisted row against the contract. A row that no longer parses
 * (a shape from an older schema version) reads as absent, so the sweep
 * perceives the asset again rather than a reader trusting stale JSON.
 */
export function toMediaPerception(
  row: MediaPerceptionRow,
): IMediaPerception | null {
  const parsed = mediaPerceptionRecordSchema.safeParse({
    assetHash: row.assetHash,
    description: row.description ?? null,
    descriptionModel: row.descriptionModel,
    descriptionStatus: row.descriptionStatus,
    diagnostics: row.diagnostics,
    durationSeconds: row.durationSeconds,
    frames: row.frames,
    framesStatus: row.framesStatus,
    kind: row.kind,
    ocr: row.ocr,
    ocrStatus: row.ocrStatus,
    schemaVersion: row.schemaVersion,
    transcript: row.transcript ?? null,
    transcriptStatus: row.transcriptStatus,
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

/** Artefacts a retry would still attempt. */
export function hasPendingArtefacts(
  record: Pick<
    MediaPerceptionRecord,
    'descriptionStatus' | 'framesStatus' | 'ocrStatus' | 'transcriptStatus'
  >,
): boolean {
  const statuses: MediaPerceptionArtefactStatus[] = [
    record.descriptionStatus,
    record.framesStatus,
    record.ocrStatus,
    record.transcriptStatus,
  ];
  return statuses.includes('pending');
}
