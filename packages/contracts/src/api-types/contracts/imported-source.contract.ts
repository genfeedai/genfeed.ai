import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import { z } from 'zod';

const sensitiveQuery =
  /token|secret|password|passwd|auth|session|credential|cookie|signature|api.?key|^code$|^key$|^state$|^utm_/i;
function sanitizedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (sensitiveQuery.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}
const urlInput = z
  .string()
  .max(2048)
  .refine((value) => sanitizedUrl(value) !== null)
  .transform((value) => sanitizedUrl(value) ?? '')
  .pipe(z.string().max(2048));
const storedUrl = z
  .string()
  .max(2048)
  .refine((value) => sanitizedUrl(value) === value);
const shortInput = z.string().trim().min(1).max(1000);
const shortStored = z
  .string()
  .min(1)
  .max(1000)
  .refine((value) => value.trim() === value);
const entityId = z.string().refine(isEntityId);
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const requestId = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  )
  .transform((value) => value.toLowerCase());
export const importedSourceKindSchema = z.enum([
  'article',
  'newsletter',
  'podcast',
  'social',
  'image',
  'video',
  'audio',
  'page',
]);
export const importedSourceContentBasisSchema = z.enum([
  'visible_selection',
  'visible_page',
  'visible_transcript',
  'metadata_only',
]);
const selectedMedia = z
  .object({
    kind: z.enum(['image', 'video', 'audio']),
    url: urlInput,
    availability: z.enum([
      'accessible',
      'embed_only',
      'unavailable',
      'unknown',
    ]),
  })
  .strict();
const snapshotFields = {
  kind: importedSourceKindSchema,
  canonicalUrl: urlInput,
  title: shortInput,
  capturedText: z
    .string()
    .max(100000)
    .refine((value) => new TextEncoder().encode(value).length <= 400000),
  contentBasis: importedSourceContentBasisSchema,
  authorDisplayName: shortInput.optional(),
  authorHandle: shortInput.optional(),
  externalIdentity: z.string().trim().min(1).max(255).optional(),
  selectedMedia: selectedMedia.optional(),
  clientCapturedAt: timestamp.optional(),
};
export const importedSourceSnapshotInputSchema = z
  .object(snapshotFields)
  .strict()
  .refine(
    (value) =>
      value.contentBasis === 'metadata_only'
        ? value.capturedText === ''
        : value.capturedText.trim().length > 0,
    {
      path: ['capturedText'],
      message: 'Text must match the reported content basis',
    },
  );
export const saveImportedSourceSchema = z
  .object({ snapshot: importedSourceSnapshotInputSchema })
  .strict();
export const recaptureImportedSourceSchema = z.object({ requestId }).strict();
export const importedSourceSnapshotSchema = z
  .object({
    ...snapshotFields,
    canonicalUrl: storedUrl,
    title: shortStored,
    authorDisplayName: shortStored.optional(),
    authorHandle: shortStored.optional(),
    externalIdentity: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => value.trim() === value)
      .optional(),
    selectedMedia: selectedMedia.extend({ url: storedUrl }).optional(),
    capturedAt: timestamp,
    captureSurface: z.literal('extension'),
    provenance: z.literal('imported'),
    evidenceAuthority: z.literal('client_reported'),
    host: z.string().min(1),
  })
  .strict()
  .refine(
    (value) =>
      value.contentBasis === 'metadata_only'
        ? value.capturedText === ''
        : value.capturedText.trim().length > 0,
    { path: ['capturedText'] },
  )
  .refine(
    (value) => {
      try {
        return value.host === new URL(value.canonicalUrl).hostname;
      } catch {
        return false;
      }
    },
    { path: ['host'] },
  );
export const importedSourceEnvelopeSchema = z
  .object({
    version: z.literal(1),
    identityDigest: digest,
    originIngredientId: entityId,
    captureRevision: z.number().int().positive(),
    recapturedFromIngredientId: entityId.optional(),
    recaptureRequestId: requestId.optional(),
    snapshot: importedSourceSnapshotSchema,
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.recapturedFromIngredientId) ===
      Boolean(value.recaptureRequestId),
    { message: 'Successor fields must occur together' },
  );
export const importedSourceViewSchema = z
  .object({
    id: entityId,
    brandId: entityId,
    recordVersion: z.number().int().positive(),
    identityDigest: digest,
    snapshot: importedSourceSnapshotSchema,
    recapturedFromIngredientId: entityId.optional(),
    deduplicated: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();
export const importedSourceListQuerySchema = z
  .object({
    page: z.number().int().min(1).max(10000).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ImportedSourceSnapshotInput = z.infer<
  typeof importedSourceSnapshotInputSchema
>;
export type SaveImportedSource = z.infer<typeof saveImportedSourceSchema>;
export type RecaptureImportedSource = z.infer<
  typeof recaptureImportedSourceSchema
>;
export type ImportedSourceSnapshot = z.infer<
  typeof importedSourceSnapshotSchema
>;
export type ImportedSourceEnvelope = z.infer<
  typeof importedSourceEnvelopeSchema
>;
export type ImportedSourceView = z.infer<typeof importedSourceViewSchema>;
export type ImportedSourceListQuery = z.infer<
  typeof importedSourceListQuerySchema
>;
