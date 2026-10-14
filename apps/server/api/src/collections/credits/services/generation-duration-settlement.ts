import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/contracts';
import {
  MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
  MEDIA_GENERATION_WORKLOAD_TYPE,
} from '@genfeedai/contracts/constants';
import type { ICreditReservation } from '@genfeedai/contracts/interfaces/billing';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import { z } from 'zod';

/** Hold metadata a per-second output carries from admission (#6624). */
const heldDurationQuoteSchema = z.object({
  avatarDurationQuote: z.object({
    estimatedSeconds: z.number().finite().positive(),
    snapshot: modelBillableQuoteSnapshotSchema,
  }),
});

export type HeldDurationQuote = z.infer<
  typeof heldDurationQuoteSchema
>['avatarDurationQuote'];

export interface DurationSettlement {
  /** Credits the hold settles at: the re-priced clip, capped at the hold. */
  settleCredits: number;
  /** Credits charged on top of the hold when the clip ran longer. */
  topUpCredits: number;
  actualSeconds?: number;
  actualCredits?: number;
  /** Why the hold settled at its estimate instead of the clip duration. */
  unresolvedReason?: string;
}

export function readHeldDurationQuote(
  metadata: unknown,
): HeldDurationQuote | undefined {
  const parsed = heldDurationQuoteSchema.safeParse(metadata);
  return parsed.success ? parsed.data.avatarDurationQuote : undefined;
}

/**
 * Re-prices the frozen admission quote at the clip duration the provider
 * returned. The rate, margin and quote date stay the admitted ones; only the
 * seconds change. A shorter clip settles below the hold (the rest is
 * refunded), a longer one settles the whole hold plus a top-up. Without a
 * usable duration or price the hold settles at its estimate, never at zero.
 */
export function resolveDurationSettlement(
  heldCredits: number,
  quote: HeldDurationQuote,
  actualSeconds: number | undefined,
): DurationSettlement {
  const estimate = (unresolvedReason: string): DurationSettlement => ({
    settleCredits: heldCredits,
    topUpCredits: 0,
    unresolvedReason,
  });
  if (
    actualSeconds === undefined ||
    !Number.isFinite(actualSeconds) ||
    !(actualSeconds > 0)
  )
    return estimate('The provider reported no clip duration');
  const { snapshot } = quote;
  const priced = quoteModelBillablePricing(
    snapshot.pricingProfile,
    {
      ...snapshot.quantities,
      duration: actualSeconds,
      modelKey: snapshot.modelKey,
      provider: snapshot.provider,
    },
    snapshot.marginMultiplier,
    snapshot.quotedAt,
    { kind: 'frozen' },
  );
  if (priced.status === 'unresolved') return estimate(priced.reason);
  const actualCredits = priced.snapshot.credits;
  return {
    actualCredits,
    actualSeconds,
    settleCredits: Math.min(actualCredits, heldCredits),
    topUpCredits: Math.max(0, actualCredits - heldCredits),
  };
}

/** The stored output's measured duration, when the upload probe recorded one. */
async function readOutputDuration(
  prisma: PrismaService,
  ingredientId: string,
  organizationId: string,
): Promise<number | undefined> {
  const output = await prisma.ingredient.findFirst({
    select: { metadata: { select: { duration: true } } },
    where: { id: ingredientId, isDeleted: false, organizationId },
  });
  const duration = output?.metadata?.duration;
  return typeof duration === 'number' && duration > 0 ? duration : undefined;
}

/**
 * Queues the settlement of a reserved output hold. A hold that carries a
 * per-second admission estimate settles to the clip duration the provider
 * returned (`completion.durationSeconds`, else the stored output's measured
 * duration): the unused part is refunded, an overrun is topped up.
 */
export async function queueHoldSettlement(
  deps: {
    logger: LoggerService;
    prisma: PrismaService;
    queue: CreditDeductionQueueService;
  },
  hold: ICreditReservation,
  output: { ingredientId: string; organizationId: string; userId: string },
  completion: { durationSeconds?: number },
): Promise<void> {
  const { ingredientId, organizationId, userId } = output;
  const durationQuote = readHeldDurationQuote(hold.metadata);
  const settlement = durationQuote
    ? resolveDurationSettlement(
        hold.amount,
        durationQuote,
        completion.durationSeconds ??
          (await readOutputDuration(deps.prisma, ingredientId, organizationId)),
      )
    : undefined;
  const { avatarDurationQuote: _frozenQuote, ...ledgerMetadata } =
    hold.metadata ?? {};
  const metadata = settlement
    ? {
        ...ledgerMetadata,
        durationSettlement: {
          actualCredits: settlement.actualCredits ?? null,
          actualSeconds: settlement.actualSeconds ?? null,
          estimatedSeconds: durationQuote?.estimatedSeconds ?? null,
          heldCredits: hold.amount,
        },
      }
    : (hold.metadata ?? undefined);
  if (settlement?.unresolvedReason)
    deps.logger.warn(
      'Per-second generation settled at its admission estimate',
      {
        ingredientId,
        organizationId,
        reason: settlement.unresolvedReason,
        reservationId: hold.id,
      },
    );
  await deps.queue.queueDeduction({
    amount: settlement?.settleCredits ?? hold.amount,
    ...(hold.brandId ? { brandId: hold.brandId } : {}),
    description: hold.description ?? 'Media generation',
    idempotencyKey: `${MEDIA_GENERATION_WORKLOAD_TYPE}-settle:${hold.id}`,
    metadata,
    organizationId,
    reservationId: hold.id,
    source: hold.source ?? ActivitySource.SCRIPT,
    type: 'deduct-credits',
    userId,
  });
  if (settlement && settlement.topUpCredits > 0)
    // The clip outran its hold. The overrun is a direct charge keyed by the
    // hold, bounded by the same overdraft the late-completion path allows.
    await deps.queue.queueDeduction({
      amount: settlement.topUpCredits,
      ...(hold.brandId ? { brandId: hold.brandId } : {}),
      description: `${hold.description ?? 'Media generation'} (duration top-up)`,
      idempotencyKey: `${MEDIA_GENERATION_WORKLOAD_TYPE}-duration-topup:${hold.id}`,
      maxOverdraftCredits:
        MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
      metadata: {
        assetId: ingredientId,
        durationTopUpOfReservationId: hold.id,
      },
      organizationId,
      source: hold.source ?? ActivitySource.SCRIPT,
      type: 'deduct-credits',
      userId,
    });
  deps.logger.log('Generation credit settlement queued', {
    ingredientId,
    organizationId,
    reservationId: hold.id,
    ...(settlement
      ? {
          settledCredits: settlement.settleCredits,
          topUpCredits: settlement.topUpCredits,
        }
      : {}),
  });
}
