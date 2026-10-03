import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import { z } from 'zod';

const entityId = z.string().refine(isEntityId);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const revision = z.number().int().positive();
const requestId = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  .transform((value) => value.toLowerCase());
const kind = z.enum(['image', 'video', 'audio']);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
export const importedSourceMediaStartSchema = z.object({ requestId }).strict();
export const importedSourceMediaRetrySchema = z
  .object({ requestId, expectedIngestRevision: revision })
  .strict();
export const importedSourceMediaBindingSchema = z
  .object({
    version: z.literal(1),
    sourceIdentityDigest: digest,
    sourceRecordVersion: revision,
    mediaIngredientId: entityId,
    mediaKind: kind,
    mediaUrlDigest: digest,
    bindingRevision: z.literal(1),
    selectedAt: timestamp,
    selectedByUserId: z.string().refine((value) => value.trim().length > 0),
  })
  .strict();
export const importedSourceMediaViewSchema = z
  .object({
    id: entityId,
    sourceId: entityId,
    sourceRecordVersion: revision,
    sourceIdentityDigest: digest,
    bindingRevision: z.union([z.literal(0), z.literal(1)]),
    state: z.enum([
      'not_requested',
      'processing',
      'ready',
      'failed',
      'uncertain',
      'unavailable',
    ]),
    ingestRevision: revision.optional(),
    ingredientId: entityId.optional(),
    artifact: z
      .object({
        organizationId: entityId,
        brandId: entityId,
        kind: z.literal('ingredient'),
        recordId: entityId,
        recordVersion: z.string().min(1),
        serializer: z.literal('ingredient'),
      })
      .strict()
      .optional(),
    mediaKind: kind.optional(),
    errorCode: z
      .enum([
        'SOURCE_MEDIA_UNAVAILABLE',
        'SOURCE_MEDIA_UNSUPPORTED',
        'SOURCE_MEDIA_CHANGED',
        'SOURCE_MEDIA_FAILED',
        'SOURCE_MEDIA_UNCERTAIN',
      ])
      .optional(),
    canRetry: z.boolean(),
  })
  .strict()
  .refine((value) => (value.state === 'ready') === Boolean(value.artifact), {
    path: ['artifact'],
  });
export type ImportedSourceMediaStart = z.infer<
  typeof importedSourceMediaStartSchema
>;
export type ImportedSourceMediaRetry = z.infer<
  typeof importedSourceMediaRetrySchema
>;
export type ImportedSourceMediaBinding = z.infer<
  typeof importedSourceMediaBindingSchema
>;
export type ImportedSourceMediaView = z.infer<
  typeof importedSourceMediaViewSchema
>;
