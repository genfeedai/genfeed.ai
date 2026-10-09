import { AsyncLocalStorage } from 'node:async_hooks';
import { readArtifactRecord } from '@api/agent-artifacts/agent-artifact-material.util';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { isPlatform } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { z } from 'zod';

export const strategyBudgetAttributionSchema = z.strictObject({
  version: z.literal(1),
  organizationId: z.string().min(1),
  brandId: z.string().min(1),
  strategyId: z.string().min(1),
  platform: z.string().refine(isPlatform),
  format: z.enum(['text', 'image', 'carousel', 'video', 'short', 'thread']),
});
export type StrategyBudgetAttribution = z.infer<
  typeof strategyBudgetAttributionSchema
>;
const storage = new AsyncLocalStorage<Readonly<StrategyBudgetAttribution>>();

/** Server execution attribution only. Caller must separately prove actor, pricing and dispatch admission. */
export async function runWithStrategyBudgetAttribution<T>(
  tx: Pick<Prisma.TransactionClient, 'agentStrategy'>,
  scope: Readonly<StrategyBudgetAttribution>,
  callback: () => Promise<T>,
): Promise<T> {
  const parsed = strategyBudgetAttributionSchema.parse(scope);
  const strategy = await tx.agentStrategy.findFirst({
    where: {
      id: parsed.strategyId,
      organizationId: parsed.organizationId,
      brandId: parsed.brandId,
      isDeleted: false,
      isActive: true,
    },
    select: { id: true, platforms: true },
  });
  if (!strategy?.platforms.includes(parsed.platform))
    throw new BusinessLogicException(
      'Strategy budget attribution is outside the execution scope',
    );
  return storage.run(Object.freeze(parsed), callback);
}

/** Reserved metadata is stripped from input. Only an exact server-read hold or the current server context can replace it. */
export function strategyBudgetMetadata(
  organizationId: string,
  metadata: unknown,
  reservation?: Readonly<{
    organizationId: string;
    brandId: string | null;
    metadata: unknown;
  }>,
): Record<string, unknown> {
  const { strategyBudgetAttribution: _untrusted, ...safe } =
    readArtifactRecord(metadata);
  const original = strategyBudgetAttributionSchema.safeParse(
    readArtifactRecord(reservation?.metadata).strategyBudgetAttribution,
  );
  if (
    original.success &&
    reservation?.organizationId === organizationId &&
    original.data.organizationId === organizationId &&
    (reservation.brandId === null ||
      reservation.brandId === original.data.brandId)
  )
    return { ...safe, strategyBudgetAttribution: original.data };
  // A legacy or invalid hold cannot acquire a new allocation from today's caller.
  if (reservation) return safe;
  const current = storage.getStore();
  return current?.organizationId === organizationId
    ? { ...safe, strategyBudgetAttribution: current }
    : safe;
}
