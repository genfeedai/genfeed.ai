import { modelBillableQuoteSnapshotSchema } from '@api/helpers/utils/credits/model-billable-quote.schema';
import type { CreditDeductionQueueService } from '@api/queues/credit-deduction/credit-deduction-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/contracts';
import {
  MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE,
  MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX,
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
  /** What the clip cost above the per-render cap: logged, never billed. */
  forgoneCredits?: number;
  /** Why the hold settled at its estimate instead of the clip duration. */
  unresolvedReason?: string;
}

/** A hold's frozen quote and its settlement at the real clip length. */
export interface HeldDurationSettlement {
  quote: HeldDurationQuote;
  settlement: DurationSettlement;
}

/** The hold fields a duration settlement or its top-up reads. */
export type DurationSettlementHold = Pick<
  ICreditReservation,
  'amount' | 'brandId' | 'description' | 'id'
> & { metadata?: unknown };

interface SettlementOutput {
  ingredientId: string;
  organizationId: string;
  userId: string;
}

export function readHeldDurationQuote(
  metadata: unknown,
): HeldDurationQuote | undefined {
  const parsed = heldDurationQuoteSchema.safeParse(metadata);
  return parsed.success ? parsed.data.avatarDurationQuote : undefined;
}

/** A positive, finite second count, or undefined. */
export function readPositiveSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/**
 * Re-prices the frozen admission quote at the clip duration the provider
 * returned. The rate, margin and quote date stay the admitted ones; only the
 * seconds change. A shorter clip settles below the hold (the rest is
 * refunded), a longer one settles the whole hold plus a top-up, and the whole
 * charge never exceeds `MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE`
 * times the hold. Without a usable duration or price the hold settles at its
 * estimate, never at zero.
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
  const seconds = readPositiveSeconds(actualSeconds);
  if (seconds === undefined)
    return estimate('The provider reported no clip duration');
  const { snapshot } = quote;
  const priced = quoteModelBillablePricing(
    snapshot.pricingProfile,
    {
      ...snapshot.quantities,
      duration: seconds,
      modelKey: snapshot.modelKey,
      provider: snapshot.provider,
    },
    snapshot.marginMultiplier,
    snapshot.quotedAt,
    { kind: 'frozen' },
  );
  if (priced.status === 'unresolved') return estimate(priced.reason);
  const actualCredits = priced.snapshot.credits;
  const maxCharge =
    heldCredits * MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE;
  return {
    actualCredits,
    actualSeconds: seconds,
    settleCredits: Math.min(actualCredits, heldCredits),
    topUpCredits: Math.max(0, Math.min(actualCredits, maxCharge) - heldCredits),
    ...(actualCredits > maxCharge
      ? { forgoneCredits: actualCredits - maxCharge }
      : {}),
  };
}

/** The duration settlement of a hold that carries a frozen per-second quote. */
export function settleHeldDuration(
  hold: Pick<DurationSettlementHold, 'amount' | 'metadata'>,
  actualSeconds: number | undefined,
): HeldDurationSettlement | undefined {
  const quote = readHeldDurationQuote(hold.metadata);
  return quote
    ? {
        quote,
        settlement: resolveDurationSettlement(
          hold.amount,
          quote,
          actualSeconds,
        ),
      }
    : undefined;
}

/** What the ledger row records about a duration settlement. */
export function durationSettlementMetadata(
  heldCredits: number,
  { quote, settlement }: HeldDurationSettlement,
): Record<string, unknown> {
  return {
    actualCredits: settlement.actualCredits ?? null,
    actualSeconds: settlement.actualSeconds ?? null,
    estimatedSeconds: quote.estimatedSeconds,
    heldCredits,
    ...(settlement.forgoneCredits
      ? { forgoneCredits: settlement.forgoneCredits }
      : {}),
  };
}

/**
 * Operator signals for a settlement that did not follow the clip: an
 * unresolved duration settles at the estimate (warn), and a clip past the
 * per-render cap leaves credits unbilled (error, which pages through Sentry).
 */
export function reportDurationSettlement(
  logger: Pick<LoggerService, 'error' | 'warn'>,
  hold: Pick<DurationSettlementHold, 'amount' | 'id'>,
  { settlement }: HeldDurationSettlement,
  output: Pick<SettlementOutput, 'ingredientId' | 'organizationId'>,
): void {
  const fields = {
    ingredientId: output.ingredientId,
    organizationId: output.organizationId,
    reservationId: hold.id,
  };
  if (settlement.unresolvedReason)
    logger.warn('Per-second generation settled at its admission estimate', {
      ...fields,
      reason: settlement.unresolvedReason,
    });
  if (settlement.forgoneCredits)
    logger.error(
      'Per-second generation ran past its per-render charge cap; excess not billed',
      {
        ...fields,
        actualCredits: settlement.actualCredits,
        actualSeconds: settlement.actualSeconds,
        forgoneCredits: settlement.forgoneCredits,
        heldCredits: hold.amount,
        maxChargeCredits:
          hold.amount * MEDIA_GENERATION_DURATION_MAX_CHARGE_HOLD_MULTIPLE,
      },
    );
}

/**
 * The overrun past a hold is a direct charge keyed by the hold, so a reserved
 * settlement, a late charge and an operator recovery of the same render
 * collapse into one top-up. The per-render cap already bounds it; the wallet
 * overdraft only keeps it recordable on an empty wallet.
 */
export async function queueDurationTopUp(
  queue: Pick<CreditDeductionQueueService, 'queueDeduction'>,
  hold: DurationSettlementHold,
  output: SettlementOutput,
  topUpCredits: number,
  source: ActivitySource,
): Promise<void> {
  if (!(topUpCredits > 0)) return;
  await queue.queueDeduction({
    amount: topUpCredits,
    ...(hold.brandId ? { brandId: hold.brandId } : {}),
    description: `${hold.description ?? 'Media generation'} (duration top-up)`,
    idempotencyKey: `${MEDIA_GENERATION_WORKLOAD_TYPE}-duration-topup:${hold.id}`,
    maxOverdraftCredits: MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
    metadata: {
      assetId: output.ingredientId,
      durationTopUpOfReservationId: hold.id,
    },
    organizationId: output.organizationId,
    source,
    type: 'deduct-credits',
    userId: output.userId,
  });
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
  return readPositiveSeconds(output?.metadata?.duration);
}

/**
 * Queues the settlement of a reserved output hold. A hold that carries a
 * per-second admission estimate settles to the clip duration the provider
 * returned (`completion.durationSeconds`, else the stored output's measured
 * duration): the unused part is refunded, an overrun is topped up to the
 * per-render cap.
 */
export async function queueHoldSettlement(
  deps: {
    logger: LoggerService;
    prisma: PrismaService;
    queue: CreditDeductionQueueService;
  },
  hold: ICreditReservation,
  output: SettlementOutput,
  completion: { durationSeconds?: number },
): Promise<void> {
  const { ingredientId, organizationId } = output;
  const held = readHeldDurationQuote(hold.metadata)
    ? settleHeldDuration(
        hold,
        completion.durationSeconds ??
          (await readOutputDuration(deps.prisma, ingredientId, organizationId)),
      )
    : undefined;
  const { avatarDurationQuote: _frozenQuote, ...ledgerMetadata } =
    hold.metadata ?? {};
  const metadata = held
    ? {
        ...ledgerMetadata,
        durationSettlement: durationSettlementMetadata(hold.amount, held),
      }
    : (hold.metadata ?? undefined);
  if (held) reportDurationSettlement(deps.logger, hold, held, output);
  const source = hold.source ?? ActivitySource.SCRIPT;
  await deps.queue.queueDeduction({
    amount: held?.settlement.settleCredits ?? hold.amount,
    ...(hold.brandId ? { brandId: hold.brandId } : {}),
    description: hold.description ?? 'Media generation',
    idempotencyKey: `${MEDIA_GENERATION_WORKLOAD_TYPE}-settle:${hold.id}`,
    metadata,
    organizationId,
    reservationId: hold.id,
    source,
    type: 'deduct-credits',
    userId: output.userId,
  });
  if (held)
    await queueDurationTopUp(
      deps.queue,
      hold,
      output,
      held.settlement.topUpCredits,
      source,
    );
  deps.logger.log('Generation credit settlement queued', {
    ingredientId,
    organizationId,
    reservationId: hold.id,
    ...(held
      ? {
          settledCredits: held.settlement.settleCredits,
          topUpCredits: held.settlement.topUpCredits,
        }
      : {}),
  });
}

/**
 * Charges an output that completed after its hold ended (#5886). The funds
 * are gone, so the charge is a direct deduction keyed by the dead hold. A hold
 * that carries a per-second quote is re-priced at the real clip length the
 * same way a reserved settlement is: the late key carries the part up to the
 * hold and the capped overrun is the shared top-up, so an operator recovery
 * of the same hold finds the same amount. Returns the credits charged.
 */
export async function queueLateHoldCharge(
  deps: {
    logger: Pick<LoggerService, 'error' | 'warn'>;
    queue: Pick<CreditDeductionQueueService, 'queueDeduction'>;
  },
  hold: ICreditReservation,
  output: SettlementOutput,
  actualSeconds: number | undefined,
): Promise<number> {
  const held = settleHeldDuration(hold, actualSeconds);
  const amount = held?.settlement.settleCredits ?? hold.amount;
  const source = hold.source ?? ActivitySource.SCRIPT;
  if (held) {
    reportDurationSettlement(deps.logger, hold, held, output);
    await queueDurationTopUp(
      deps.queue,
      hold,
      output,
      held.settlement.topUpCredits,
      source,
    );
  }
  await deps.queue.queueDeduction({
    amount,
    ...(hold.brandId ? { brandId: hold.brandId } : {}),
    description: hold.description ?? 'Media generation',
    idempotencyKey: `${MEDIA_GENERATION_LATE_SETTLEMENT_KEY_PREFIX}:${hold.id}`,
    referenceId: hold.id,
    referenceType: 'credit_reservation',
    maxOverdraftCredits: MEDIA_GENERATION_LATE_SETTLEMENT_MAX_OVERDRAFT_CREDITS,
    metadata: {
      assetId: output.ingredientId,
      lateSettlementOfReservationId: hold.id,
      ...(held
        ? { durationSettlement: durationSettlementMetadata(hold.amount, held) }
        : {}),
    },
    organizationId: output.organizationId,
    source,
    type: 'deduct-credits',
    userId: output.userId,
  });
  return amount + (held?.settlement.topUpCredits ?? 0);
}
