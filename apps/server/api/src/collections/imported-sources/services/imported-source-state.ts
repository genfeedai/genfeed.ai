import { createHash } from 'node:crypto';
import type {
  ImportedSourceEnvelope,
  ImportedSourceSnapshotInput,
  ImportedSourceView,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import {
  importedSourceEnvelopeSchema,
  saveImportedSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import type { Ingredient } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';

export interface ImportedSourceScope {
  organizationId: string;
  brandId: string;
  userId: string;
}
export type ImportedSourceRecord = Pick<
  Ingredient,
  | 'id'
  | 'organizationId'
  | 'brandId'
  | 'version'
  | 'sourceActionId'
  | 'providerData'
  | 'createdAt'
  | 'updatedAt'
  | 'isDeleted'
>;
export const importedSourceStateError = (
  code = 'IMPORTED_SOURCE_STATE_INVALID',
  details?: Record<string, unknown>,
) =>
  new ConflictException({
    code,
    message: 'Imported source state cannot be reused.',
    ...details,
  });
export function normalizeImportedSourceInput(
  input: unknown,
): ImportedSourceSnapshotInput {
  const parsed = saveImportedSourceSchema.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'IMPORTED_SOURCE_INPUT_INVALID',
      message: 'Invalid imported source snapshot.',
      paths: parsed.error.issues.map((issue) => issue.path.join('.')),
    });
  return parsed.data.snapshot;
}
export function importedSourceIdentityDigest(
  scope: Pick<ImportedSourceScope, 'organizationId' | 'brandId'>,
  snapshot: ImportedSourceSnapshotInput,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'imported-source/v1',
        scope.organizationId,
        scope.brandId,
        snapshot.kind,
        snapshot.canonicalUrl,
        snapshot.title,
        snapshot.authorDisplayName ?? null,
        snapshot.authorHandle ?? null,
        snapshot.capturedText,
        snapshot.contentBasis,
        snapshot.externalIdentity ?? null,
        snapshot.selectedMedia
          ? [
              snapshot.selectedMedia.kind,
              snapshot.selectedMedia.url,
              snapshot.selectedMedia.availability,
            ]
          : null,
      ]),
    )
    .digest('hex');
}
export const importedSourceRootId = (digest: string) => `c${digest}`;
export function importedSourceRecaptureId(
  scope: Pick<ImportedSourceScope, 'organizationId' | 'brandId'>,
  deletedIngredientId: string,
  requestId: string,
): string {
  return `c${createHash('sha256')
    .update(
      JSON.stringify([
        'imported-source-recapture/v1',
        scope.organizationId,
        scope.brandId,
        deletedIngredientId,
        requestId,
      ]),
    )
    .digest('hex')}`;
}
export function readImportedSourceEnvelope(
  record: ImportedSourceRecord,
): ImportedSourceEnvelope {
  const data = record.providerData;
  const raw =
    data && typeof data === 'object' && !Array.isArray(data)
      ? data.importedSource
      : undefined;
  const parsed = importedSourceEnvelopeSchema.safeParse(raw);
  if (!parsed.success || !record.organizationId || !record.brandId)
    throw importedSourceStateError();
  const envelope = parsed.data;
  const digest = importedSourceIdentityDigest(
    { organizationId: record.organizationId, brandId: record.brandId },
    envelope.snapshot,
  );
  const expectedId =
    envelope.recaptureRequestId && envelope.recapturedFromIngredientId
      ? importedSourceRecaptureId(
          { organizationId: record.organizationId, brandId: record.brandId },
          envelope.recapturedFromIngredientId,
          envelope.recaptureRequestId,
        )
      : importedSourceRootId(digest);
  if (
    envelope.identityDigest !== digest ||
    record.version !== envelope.captureRevision ||
    record.sourceActionId !== `imported-source:v1:${digest}` ||
    envelope.originIngredientId !== importedSourceRootId(digest) ||
    record.id !== expectedId ||
    (!envelope.recapturedFromIngredientId && envelope.captureRevision !== 1)
  )
    throw importedSourceStateError();
  return envelope;
}
export function projectImportedSource(
  record: ImportedSourceRecord,
  deduplicated = false,
): ImportedSourceView {
  const envelope = readImportedSourceEnvelope(record);
  if (!record.brandId) throw importedSourceStateError();
  return {
    id: record.id,
    brandId: record.brandId,
    recordVersion: record.version,
    identityDigest: envelope.identityDigest,
    snapshot: envelope.snapshot,
    ...(envelope.recapturedFromIngredientId
      ? { recapturedFromIngredientId: envelope.recapturedFromIngredientId }
      : {}),
    deduplicated,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
