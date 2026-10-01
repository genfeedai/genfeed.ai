import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  STORYBOARD_CHARACTER_REPLACE_LIMITATIONS,
  STORYBOARD_CHARACTER_REPLACE_MODEL_KEY,
  storyboardCharacterOperationReceiptSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import type { StoryboardRunConfig } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { z } from 'zod';

export const CHARACTER_JOURNAL_CAPACITY = 128;
export const CHARACTER_LEASE_MS = 60_000;
const https = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));
const version = z
  .object({ id: z.string().min(1), updatedAt: z.string().datetime() })
  .strict();
export const characterOperationSchema = z
  .object({
    version: z.literal(1),
    operationId: z.string().uuid(),
    intentHash: z.string(),
    runId: z.string(),
    organizationId: z.string(),
    brandId: z.string(),
    shotId: z.string(),
    videoAssetId: z.string(),
    imageAssetIds: z.array(z.string()).max(8),
    prompt: z.string(),
    modelKey: z.literal(STORYBOARD_CHARACTER_REPLACE_MODEL_KEY),
    sourceVersion: version.optional(),
    referenceVersions: z.array(version).optional(),
    shotFingerprint: z.string(),
    sourceFingerprint: z.string(),
    body: z
      .object({
        video_url: https,
        image_urls: z.array(https).min(1).max(8),
        prompt: z.string(),
        resolution: z.string(),
      })
      .strict()
      .optional(),
    credentialFingerprint: z.string().optional(),
    legacy: z.literal(true).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    leaseToken: z.string().optional(),
    leaseUntil: z.number().optional(),
    state: z.enum([
      'submitting',
      'submitted',
      'running',
      'reconciling',
      'ready',
      'failed',
      'cancelled',
      'blocked',
    ]),
    errorCode: z.string().optional(),
    receipts: z.array(
      z
        .object({
          requestId: z.string().min(1).max(200),
          status: z.enum([
            'queued',
            'in_progress',
            'completed',
            'failed',
            'nsfw',
            'canceled',
            'unknown',
          ]),
          outputUrl: https.optional(),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((op, ctx) => {
    if (
      !op.legacy &&
      (!op.body ||
        !op.credentialFingerprint ||
        !op.sourceVersion ||
        !op.referenceVersions)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Submission identity is required',
      });
  });
export const characterJournalSchema = z
  .array(characterOperationSchema)
  .max(CHARACTER_JOURNAL_CAPACITY);
export type CharacterOperation = z.infer<typeof characterOperationSchema>;
export function characterStructuralAssociation(
  config: StoryboardRunConfig,
  op: CharacterOperation,
): boolean {
  const shot = config.plan?.shots.find((item) => item.id === op.shotId);
  return Boolean(
    shot &&
      storyboardConfigHash(shot) === op.shotFingerprint &&
      storyboardConfigHash(config.sourceSnapshot) === op.sourceFingerprint,
  );
}
export function characterReceipt(op: CharacterOperation, current: boolean) {
  const first = op.receipts[0];
  return storyboardCharacterOperationReceiptSchema.parse({
    operationId: op.operationId,
    runId: op.runId,
    shotId: op.shotId,
    videoAssetId: op.videoAssetId,
    imageAssetIds: op.imageAssetIds,
    modelKey: op.modelKey,
    status: op.state,
    ...(first ? { requestId: first.requestId } : {}),
    acceptedRequestIds: op.receipts.map((r) => r.requestId),
    association: current ? 'current' : 'detached',
    errorCode: op.errorCode,
    ...(first?.outputUrl
      ? {
          output: {
            kind: 'provider_url',
            url: first.outputUrl,
            retained: false,
          },
        }
      : {}),
    chargedCredits: 0,
    limitations: [...STORYBOARD_CHARACTER_REPLACE_LIMITATIONS],
  });
}
export function characterObservation(
  op: CharacterOperation,
  requestId: string,
  observedStatus: unknown,
  outputUrl?: string,
): CharacterOperation {
  const status: CharacterOperation['receipts'][number]['status'] =
    typeof observedStatus === 'string' &&
    [
      'queued',
      'in_progress',
      'completed',
      'failed',
      'nsfw',
      'canceled',
    ].includes(observedStatus)
      ? (observedStatus as CharacterOperation['receipts'][number]['status'])
      : 'unknown';
  const validUrl =
    status !== 'unknown' && https.safeParse(outputUrl).success
      ? outputUrl
      : undefined;
  const receipts = [...op.receipts];
  const index = receipts.findIndex((r) => r.requestId === requestId);
  const old = receipts[index];
  const terminal = ['completed', 'failed', 'nsfw', 'canceled'];
  const receipt =
    old && terminal.includes(old.status)
      ? {
          ...old,
          ...(old.status === status && validUrl ? { outputUrl: validUrl } : {}),
        }
      : {
          requestId,
          status,
          ...((validUrl ?? old?.outputUrl)
            ? { outputUrl: validUrl ?? old?.outputUrl }
            : {}),
        };
  if (index < 0) receipts.push(receipt);
  else receipts[index] = receipt;
  const canonical = receipts[0];
  const state =
    canonical.status === 'unknown'
      ? 'reconciling'
      : canonical.status === 'completed'
        ? canonical.outputUrl
          ? 'ready'
          : 'reconciling'
        : canonical.status === 'in_progress'
          ? 'running'
          : canonical.status === 'failed' || canonical.status === 'nsfw'
            ? 'failed'
            : canonical.status === 'canceled'
              ? 'cancelled'
              : 'submitted';
  return {
    ...op,
    receipts,
    state,
    updatedAt: new Date().toISOString(),
    errorCode:
      receipts.length > 1
        ? 'CHARACTER_REPLACEMENT_PROVIDER_IDEMPOTENCY_VIOLATION'
        : canonical.status === 'unknown'
          ? 'CHARACTER_REPLACEMENT_PROVIDER_STATUS_UNKNOWN'
          : canonical.status === 'completed' && !canonical.outputUrl
            ? 'CHARACTER_REPLACEMENT_OUTPUT_MISSING'
            : undefined,
  };
}
