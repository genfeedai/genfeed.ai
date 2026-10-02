import { brandedGenerationReceiptV1Schema } from '@genfeedai/contracts/api-types/contracts/branded-generation.contract';
import { z } from 'zod';

const {
  actorId: _actorId,
  requestKey: _requestKey,
  ...receiptShape
} = brandedGenerationReceiptV1Schema.shape;
const bytes = (value: unknown, maximum: number) =>
  new TextEncoder().encode(JSON.stringify(value)).length <= maximum;
const publicShape = {
  ...receiptShape,
  platform: receiptShape.platform.nullable(),
  parentRequestId: receiptShape.parentRequestId.nullable(),
  runId: receiptShape.runId.nullable(),
  workflowExecutionId: receiptShape.workflowExecutionId.nullable(),
  generationId: receiptShape.generationId.nullable(),
};
export const brandedGenerationReceiptReadV1Schema = z
  .strictObject(publicShape)
  .refine((value) => bytes(value, 768000), 'Receipt read exceeds byte limit');
export type BrandedGenerationReceiptReadV1 = z.infer<
  typeof brandedGenerationReceiptReadV1Schema
>;
export const brandedGenerationReceiptRevisionReadV1Schema = z
  .strictObject({
    ...publicShape,
    id: z.string().min(1).max(267),
    receiptId: receiptShape.id,
  })
  .superRefine((value, ctx) => {
    if (value.id !== `${value.receiptId}:${value.revision}`)
      ctx.addIssue({ code: 'custom', message: 'Revision identity mismatch' });
    if (!bytes(value, 768000))
      ctx.addIssue({
        code: 'custom',
        message: 'Receipt read exceeds byte limit',
      });
  });
export type BrandedGenerationReceiptRevisionReadV1 = z.infer<
  typeof brandedGenerationReceiptRevisionReadV1Schema
>;
const receiptRevision = z.number().int().min(0).max(2147483647);
const stage = z.enum(['original', 'enhanced', 'compiled']);
const reasonCode = z.enum([
  'prompt_snapshot_unavailable',
  'prompt_payload_purged',
  'prompt_integrity_failed',
]);
const text = z
  .string()
  .refine(
    (value) => new TextEncoder().encode(value).length <= 65536,
    'Prompt exceeds byte limit',
  );
const contentHash = receiptShape.requestHash;
const result = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('retained'), text, contentHash }),
  z.strictObject({ status: z.literal('unavailable'), reasonCode }),
]);
export const brandedGenerationPromptInspectionSourceV1Schema = z.strictObject({
  receiptId: receiptShape.id,
  receiptRevision,
  stage,
  result,
});
export type BrandedGenerationPromptInspectionSourceV1 = z.infer<
  typeof brandedGenerationPromptInspectionSourceV1Schema
>;
const identity = {
  id: z.string().min(1).max(276),
  receiptId: receiptShape.id,
  receiptRevision,
  stage,
};
export const brandedGenerationPromptInspectionV1Schema = z
  .discriminatedUnion('status', [
    z.strictObject({
      ...identity,
      status: z.literal('retained'),
      text,
      contentHash,
      reasonCode: z.null(),
    }),
    z.strictObject({
      ...identity,
      status: z.literal('unavailable'),
      reasonCode,
      text: z.null(),
      contentHash: z.null(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.id !== `${value.receiptId}:${value.receiptRevision}:${value.stage}`
    )
      ctx.addIssue({ code: 'custom', message: 'Prompt identity mismatch' });
    if (!bytes(value, 400000))
      ctx.addIssue({
        code: 'custom',
        message: 'Prompt read exceeds byte limit',
      });
  });
export type BrandedGenerationPromptInspectionV1 = z.infer<
  typeof brandedGenerationPromptInspectionV1Schema
>;
