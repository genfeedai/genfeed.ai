import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditHoldRecoveryAction,
  CreditReservationStatus,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';

/** An unknown provider status is re-polled after 30m, doubling per attempt up to 6h (#6168). */
const RECOVERY_BACKOFF_BASE_MS = 30 * 60 * 1000;
const RECOVERY_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

export interface HoldReconcileStats {
  awaitingIntentProof: number;
  pollsRemaining: number;
  expiredIntentHolds: number;
  recoveredIntentHolds: number;
}

interface BackoffHold {
  id: string;
  organizationId: string;
  recoveryAttempts?: number;
  recoveryNextAttemptAt?: Date | null;
}

/** A backed-off hold does not spend the sweep's poll budget. */
function isRecoveryBackedOff(hold: BackoffHold, now: Date): boolean {
  return (
    !!hold.recoveryNextAttemptAt &&
    hold.recoveryNextAttemptAt.getTime() > now.getTime()
  );
}

/** Back off a hold whose provider poll resolved nothing, so the next sweep spends its budget elsewhere. */
async function deferRecovery(
  prisma: PrismaService,
  logger: LoggerService,
  hold: BackoffHold,
  now: Date,
): Promise<void> {
  const attempts = (hold.recoveryAttempts ?? 0) + 1;
  const delay = Math.min(
    RECOVERY_BACKOFF_BASE_MS * 2 ** (attempts - 1),
    RECOVERY_BACKOFF_MAX_MS,
  );
  try {
    await prisma.creditReservation.updateMany({
      data: {
        recoveryAttempts: attempts,
        recoveryNextAttemptAt: new Date(now.getTime() + delay),
      },
      where: {
        id: hold.id,
        isDeleted: false,
        organizationId: hold.organizationId,
        status: CreditReservationStatus.RESERVED,
      },
    });
  } catch (error: unknown) {
    logger.error('Generation hold recovery backoff failed', error, {
      organizationId: hold.organizationId,
      reservationId: hold.id,
    });
  }
}

/**
 * Spend one provider poll on an intent hold past its ceiling. Returns how many
 * holds it acted on, or undefined when the hold waits (no recovery service, no
 * budget left, or backed off after an unknown status) so later holds are
 * reached (#6168).
 */
export async function pollHoldAtCeiling(
  deps: {
    holdRecovery?: GenerationHoldRecoveryService;
    logger: LoggerService;
    prisma: PrismaService;
  },
  hold: BackoffHold,
  now: Date,
  stats: HoldReconcileStats,
): Promise<number | undefined> {
  if (
    !deps.holdRecovery ||
    stats.pollsRemaining <= 0 ||
    isRecoveryBackedOff(hold, now)
  ) {
    stats.awaitingIntentProof += 1;
    return undefined;
  }
  stats.pollsRemaining -= 1;
  let action: CreditHoldRecoveryAction | undefined;
  try {
    action = await deps.holdRecovery.recoverAtCeiling(
      hold.organizationId,
      hold.id,
    );
  } finally {
    if (!action) await deferRecovery(deps.prisma, deps.logger, hold, now);
  }
  if (!action) return 0;
  if (action === CreditHoldRecoveryAction.RELEASE)
    stats.expiredIntentHolds += 1;
  stats.recoveredIntentHolds += 1;
  return 1;
}
