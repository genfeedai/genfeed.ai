import {
  brandRemixDraftSchema,
  savedAdRemixSourceSelectorSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { z } from 'zod';

const opaqueIdSchema = savedAdRemixSourceSelectorSchema.shape.savedAdId;
const timestampSchema = z.iso.datetime({ offset: true });
// Reuse the canonical copy and organic branches, including their strict fields.
const allocationDraftSchema = brandRemixDraftSchema.extend({
  output: brandRemixDraftSchema.shape.output.options[0],
  target: brandRemixDraftSchema.shape.target.options[0],
});

/** Structural context only; authenticated server code must supply this separately. */
export const agentSourceAllocationContextSchema = z
  .object({
    organizationId: opaqueIdSchema,
    actorUserId: opaqueIdSchema,
  })
  .strict();

/** No authority or server-generated identity can be supplied through request data.
 * Draft selections (target `credentialId`, identity persona) are caller-chosen and
 * must be authorized within the organization by the service before use.
 * Freshness arithmetic and comparison to the server clock belong to the service.
 */
export const prepareSavedAdSourceAllocationSchema = z
  .object({
    brandId: opaqueIdSchema,
    strategyId: opaqueIdSchema,
    executionId: opaqueIdSchema,
    savedAdId: opaqueIdSchema,
    expectedSourceUpdatedAt: timestampSchema,
    freshnessWindowMs: z.number().positive(),
    draft: allocationDraftSchema,
  })
  .strict();

/** Parsing proves shape, not persisted allocation, authentication or authorization.
 * This scalar receipt is immutable; its digest representation carries no authority.
 */
export const agentSourceAllocationReceiptSchema = z
  .object({
    allocationId: opaqueIdSchema,
    organizationId: opaqueIdSchema,
    brandId: opaqueIdSchema,
    strategyId: opaqueIdSchema,
    executionId: opaqueIdSchema,
    actorUserId: opaqueIdSchema,
    sourceKind: z.literal('saved_ad'),
    sourceId: opaqueIdSchema,
    remixRunId: opaqueIdSchema,
    allocationInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: timestampSchema,
  })
  .strict()
  .readonly();

export type AgentSourceAllocationContext = z.infer<
  typeof agentSourceAllocationContextSchema
>;
export type PrepareSavedAdSourceAllocation = z.infer<
  typeof prepareSavedAdSourceAllocationSchema
>;
export type AgentSourceAllocationReceipt = z.infer<
  typeof agentSourceAllocationReceiptSchema
>;
