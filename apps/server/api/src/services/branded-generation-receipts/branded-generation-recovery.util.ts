import { randomUUID } from 'node:crypto';
import type { BrandedGenerationActorV1 } from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import { BRANDED_GENERATION_DISPATCH_WINDOW_MS } from '@api/services/branded-generation-receipts/branded-generation-state.util';
import type {
  BrandedGenerationDispatchRecoveryV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { z } from 'zod';

/** Receipts last updated before this instant have outlived the dispatch window. */
export function dispatchWindowCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - BRANDED_GENERATION_DISPATCH_WINDOW_MS);
}

const SKIPPABLE_RECOVERY_ERRORS: ReadonlySet<string> = new Set([
  'receipt_access_denied',
  'receipt_deleted',
  'receipt_state_conflict',
  'receipt_version_conflict',
  'request_payload_conflict',
]);

/**
 * Blocks each expired receipt. A receipt that changed, was deleted or lost its
 * scope meanwhile is skipped; any other failure stops the sweep.
 */
export async function blockExpiredDispatches(
  rows: ReadonlyArray<{ id: string }>,
  blockOne: (row: { id: string; revision: number }) => Promise<void>,
): Promise<BrandedGenerationDispatchRecoveryV1> {
  const result: BrandedGenerationDispatchRecoveryV1 = {
    blocked: [],
    skipped: [],
  };
  for (const row of rows) {
    try {
      await blockOne(row as { id: string; revision: number });
      result.blocked.push(row.id);
    } catch (error) {
      if (
        error instanceof Error &&
        SKIPPABLE_RECOVERY_ERRORS.has(error.message)
      )
        result.skipped.push(row.id);
      else throw error;
    }
  }
  return result;
}

export async function recordReceiptEvent(
  tx: Prisma.TransactionClient,
  actor: BrandedGenerationActorV1,
  receipt: BrandedGenerationReceiptV1,
  operationKey: string,
  operationHash: string,
  type: string,
): Promise<void> {
  await tx.brandedGenerationReceiptEvent.create({
    data: {
      id: randomUUID(),
      receiptId: receipt.id,
      organizationId: actor.organizationId,
      brandId: actor.brandId,
      actorId: actor.actorId,
      operationKey,
      operationHash,
      revision: receipt.revision,
      type,
      projection: toPrismaJson(receipt),
      isDeleted: receipt.isDeleted,
    },
  });
}

/** Idempotency key and optimistic revision every receipt mutation carries. */
export const mutationSchema = z.strictObject({
  operationKey: z
    .string()
    .min(1)
    .max(256)
    .refine((value) =>
      [...value].every((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && (code < 127 || code > 159);
      }),
    ),
  expectedRevision: z.number().int().nonnegative().max(2147483647),
});
