import { createHash } from 'node:crypto';
import type {
  AgentImportedSourceIngestInput,
  AgentImportedSourceIngestScope,
  ImportedSourceMediaProjectionInput,
  SourceCaptureIngest,
} from '@api/services/agent-source-ingest/agent-source-ingest.interface';
import type {
  ImportedSourceMediaBinding,
  ImportedSourceMediaView,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import {
  importedSourceMediaBindingSchema,
  importedSourceMediaStartSchema,
  importedSourceMediaViewSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type { Prisma } from '@genfeedai/prisma';
import {
  IngredientCategory,
  IngredientStatus,
  toPrismaJson,
} from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { z } from 'zod';

const id = z.string().refine(isEntityId);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
const time = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const ingestSchema = z
  .object({
    version: z.literal(1),
    sourceId: id,
    sourceIdentityDigest: digest,
    mediaUrlDigest: digest,
    mediaKind: z.enum(['image', 'video', 'audio']),
    actorUserId: z.string().refine((value) => value.trim().length > 0),
    ingestRevision: z.number().int().positive(),
    attemptId: uuid,
    requestId: uuid,
    retryFromRevision: z.number().int().positive().optional(),
    storageId: id,
    startedAt: time,
    leaseUntil: time,
    state: z.enum(['claimed', 'submitted', 'ready', 'failed', 'uncertain']),
    jobId: z.string().min(1).optional(),
    errorCode: importedSourceMediaViewSchema.shape.errorCode,
  })
  .strict()
  .refine(
    (value) =>
      value.state !== 'submitted' ||
      value.jobId === `agent-source-${value.storageId}`,
  )
  .refine(
    (value) => Date.parse(value.leaseUntil) > Date.parse(value.startedAt),
  );
function stateError(): ConflictException {
  return new ConflictException({
    code: 'SOURCE_MEDIA_CHANGED',
    message: 'Imported source media state cannot be reused.',
  });
}
function object(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw stateError();
  return value;
}
export function parseImportedSourceMediaBinding(
  value: Prisma.JsonValue | null,
): ImportedSourceMediaBinding | undefined {
  const raw = object(value).importedSourceMedia;
  if (raw === undefined) return undefined;
  const parsed = importedSourceMediaBindingSchema.safeParse(raw);
  if (!parsed.success) throw stateError();
  return parsed.data;
}
export function parseSourceCaptureIngest(
  value: Prisma.JsonValue | null,
): SourceCaptureIngest {
  const parsed = ingestSchema.safeParse(object(value).sourceCaptureIngest);
  if (!parsed.success) throw stateError();
  return parsed.data;
}
export function importedSourceMediaUrlDigest(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
export function importedSourceMediaId(
  scope: AgentImportedSourceIngestScope,
  sourceId: string,
  sourceIdentityDigest: string,
  mediaKind: SourceCaptureIngest['mediaKind'],
  mediaUrlDigest: string,
): string {
  return `c${importedSourceMediaUrlDigest(JSON.stringify(['imported-source-media/v1', scope.organizationId, scope.brandId, sourceId, sourceIdentityDigest, mediaKind, mediaUrlDigest]))}`;
}
export function importedSourceStorageId(
  mediaIngredientId: string,
  ingestRevision: number,
  attemptId: string,
): string {
  return `c${importedSourceMediaUrlDigest(JSON.stringify(['imported-source-storage/v1', mediaIngredientId, ingestRevision, attemptId]))}`;
}
export function sourceCaptureLeaseExpired(
  ingest: SourceCaptureIngest,
  now = Date.now(),
): boolean {
  return now >= Date.parse(ingest.leaseUntil);
}
export function mergeImportedSourceMediaBinding(
  value: Prisma.JsonValue | null,
  binding: ImportedSourceMediaBinding,
): Prisma.InputJsonValue {
  return toPrismaJson({
    ...object(value),
    importedSourceMedia: importedSourceMediaBindingSchema.parse(binding),
  });
}
export function mergeSourceCaptureIngest(
  value: Prisma.JsonValue | null,
  ingest: SourceCaptureIngest,
): Prisma.InputJsonValue {
  return toPrismaJson({
    ...object(value),
    sourceCaptureIngest: ingestSchema.parse(ingest),
  });
}
export function projectImportedSourceMediaView(
  input: ImportedSourceMediaProjectionInput,
): ImportedSourceMediaView {
  const { binding, media, ingest } = input;
  const base = {
    id: input.sourceId,
    sourceId: input.sourceId,
    sourceRecordVersion: input.sourceRecordVersion,
    sourceIdentityDigest: input.sourceIdentityDigest,
  };
  if (input.unavailable)
    return {
      ...base,
      bindingRevision: binding ? 1 : 0,
      state: 'unavailable',
      canRetry: false,
      errorCode: 'SOURCE_MEDIA_UNAVAILABLE',
      ...(binding ? { mediaKind: binding.mediaKind } : {}),
    };
  if (!binding)
    return {
      ...base,
      bindingRevision: 0,
      state: 'not_requested',
      canRetry: false,
    };
  if (!media || !ingest) throw stateError();
  if (
    binding.mediaIngredientId !== media.id ||
    binding.sourceRecordVersion !== input.sourceRecordVersion ||
    binding.sourceIdentityDigest !== input.sourceIdentityDigest ||
    ingest.sourceId !== input.sourceId ||
    ingest.sourceIdentityDigest !== input.sourceIdentityDigest ||
    ingest.mediaKind !== binding.mediaKind ||
    ingest.mediaUrlDigest !== binding.mediaUrlDigest ||
    media.version !== ingest.ingestRevision ||
    media.sourceActionId !== `imported-source-media:v1:${media.id.slice(1)}` ||
    media.organizationId !== input.scope.organizationId ||
    media.brandId !== input.scope.brandId ||
    media.id !==
      importedSourceMediaId(
        input.scope,
        input.sourceId,
        input.sourceIdentityDigest,
        binding.mediaKind,
        binding.mediaUrlDigest,
      ) ||
    ingest.storageId !==
      importedSourceStorageId(media.id, ingest.ingestRevision, ingest.attemptId)
  )
    throw stateError();
  const ready = ingest.state === 'ready';
  const category = {
    image: IngredientCategory.IMAGE,
    video: IngredientCategory.VIDEO,
    audio: IngredientCategory.AUDIO,
  }[binding.mediaKind];
  if (
    media.category !== category ||
    (ready && (media.status !== IngredientStatus.UPLOADED || !media.s3Key)) ||
    (ingest.state === 'failed' && media.status !== IngredientStatus.FAILED) ||
    (!ready &&
      ingest.state !== 'failed' &&
      media.status !== IngredientStatus.PROCESSING)
  )
    throw stateError();
  const state = ready
    ? 'ready'
    : ingest.state === 'failed'
      ? 'failed'
      : ingest.state === 'uncertain'
        ? 'uncertain'
        : 'processing';
  return importedSourceMediaViewSchema.parse({
    ...base,
    bindingRevision: 1,
    state,
    ingestRevision: ingest.ingestRevision,
    ingredientId: media.id,
    mediaKind: binding.mediaKind,
    canRetry:
      state === 'failed' ||
      (state === 'uncertain' && sourceCaptureLeaseExpired(ingest)),
    ...(ingest.errorCode ? { errorCode: ingest.errorCode } : {}),
    ...(ready
      ? {
          artifact: {
            organizationId: input.scope.organizationId,
            brandId: input.scope.brandId,
            kind: 'ingredient',
            recordId: media.id,
            recordVersion: String(media.version),
            serializer: 'ingredient',
          },
        }
      : {}),
  });
}

export function createSourceCaptureIngest(
  input: AgentImportedSourceIngestInput,
  scope: AgentImportedSourceIngestScope,
  binding: ImportedSourceMediaBinding,
  ingestRevision: number,
  startedAt: string,
  retryFromRevision?: number,
): SourceCaptureIngest {
  const parsedBinding = importedSourceMediaBindingSchema.safeParse(binding);
  const request = importedSourceMediaStartSchema.safeParse({
    requestId: input.requestId,
  });
  if (
    !parsedBinding.success ||
    !request.success ||
    !time.safeParse(startedAt).success ||
    !isEntityId(input.sourceId) ||
    !isEntityId(scope.organizationId) ||
    !isEntityId(scope.brandId) ||
    typeof scope.userId !== 'string' ||
    !scope.userId.trim() ||
    input.sourceIdentityDigest !== binding.sourceIdentityDigest ||
    input.sourceRecordVersion !== binding.sourceRecordVersion ||
    binding.mediaIngredientId !==
      importedSourceMediaId(
        scope,
        input.sourceId,
        binding.sourceIdentityDigest,
        binding.mediaKind,
        binding.mediaUrlDigest,
      ) ||
    !Number.isSafeInteger(ingestRevision) ||
    ingestRevision < 1 ||
    ingestRevision > 2147483647 ||
    (ingestRevision === 1
      ? retryFromRevision !== undefined
      : retryFromRevision !== ingestRevision - 1)
  )
    throw stateError();
  const leaseEnd = Date.parse(startedAt) + 3000000;
  if (
    !Number.isFinite(leaseEnd) ||
    !Number.isFinite(new Date(leaseEnd).getTime())
  )
    throw stateError();
  const fresh = ingestSchema.safeParse({
    version: 1,
    sourceId: input.sourceId,
    sourceIdentityDigest: parsedBinding.data.sourceIdentityDigest,
    mediaUrlDigest: parsedBinding.data.mediaUrlDigest,
    mediaKind: parsedBinding.data.mediaKind,
    actorUserId: scope.userId,
    ingestRevision,
    attemptId: request.data.requestId,
    requestId: request.data.requestId,
    ...(retryFromRevision === undefined ? {} : { retryFromRevision }),
    storageId: importedSourceStorageId(
      binding.mediaIngredientId,
      ingestRevision,
      request.data.requestId,
    ),
    startedAt,
    leaseUntil: new Date(leaseEnd).toISOString(),
    state: 'claimed',
  });
  if (!fresh.success) throw stateError();
  return fresh.data;
}
export function assertSourceCaptureAttemptMatch(
  current: SourceCaptureIngest,
  expected: SourceCaptureIngest,
): void {
  if (
    !['claimed', 'submitted', 'uncertain'].includes(current.state) ||
    current.sourceId !== expected.sourceId ||
    current.sourceIdentityDigest !== expected.sourceIdentityDigest ||
    current.mediaUrlDigest !== expected.mediaUrlDigest ||
    current.mediaKind !== expected.mediaKind ||
    current.actorUserId !== expected.actorUserId ||
    current.ingestRevision !== expected.ingestRevision ||
    current.attemptId !== expected.attemptId ||
    current.requestId !== expected.requestId ||
    current.retryFromRevision !== expected.retryFromRevision ||
    current.storageId !== expected.storageId
  )
    throw stateError();
}
