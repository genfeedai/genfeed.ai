import { hashToken } from '@api/auth/shared/pkce.util';
import { hashCanonicalEmail } from '@api/auth/shared/signup-email-policy.util';
import { isFreeTrialEnforced } from '@api/collections/credits/services/free-trial-state.util';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { CreditTransactionCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

/** Free-credit grants one IP address may collect in a rolling day. */
export const MAX_FREE_GRANTS_PER_IP_PER_DAY = 5;
const IP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Request-scoped facts a grant caller may hold that the database does not. */
export type GrantEligibilityOptions = {
  /** Hash of the verified card's Stripe fingerprint, for grants that need one. */
  cardKey?: string | null;
  /** Client IP to use when the user has no session yet. */
  ipAddress?: string | null;
};

export type SignupGrantRefusal =
  | 'card-required'
  | 'duplicate-card'
  | 'duplicate-mailbox'
  | 'email-unverified'
  | 'ip-velocity';

export type SignupGrantEligibility =
  | {
      cardKey: string | null;
      emailKey: string | null;
      ipKey: string | null;
      isEligible: true;
    }
  | { isEligible: false; reason: SignupGrantRefusal };

/**
 * Whether a user may collect an onboarding free-credit grant (the signup gift
 * or the trial credits). The grants are free money, so on hosted deployments
 * they go only to a verified mailbox that has not already collected one, from
 * an IP that is not collecting them in bulk:
 *
 * - the user's email must be verified (OAuth and magic-link signups arrive
 *   verified; email/password users get theirs on verification);
 * - every alias of a mailbox (Gmail dots, `+tags`, `googlemail.com`) counts as
 *   one mailbox, keyed by a hash stored on the grant's ledger row;
 * - grants that require a card (the trial credits) need the key of a verified
 *   card that no other account has used for the same grant;
 * - at most {@link MAX_FREE_GRANTS_PER_IP_PER_DAY} grants of one kind go to
 *   accounts that signed in from the same address within a day. The address
 *   is the user's first session, hashed onto the grant's ledger row so the
 *   count survives sign-outs (sessions are hard-deleted). A grant paid before
 *   any session exists (an OAuth signup's gift) is not IP-checked; the trial
 *   credits, paid after onboarding, always are. An email/password signup has
 *   no session until its link is followed, so the verification request's IP
 *   stands in for it.
 *
 * Runs inside the grant transaction so the read and the grant are serialised
 * together. Deployments without the hosted free trial are always eligible.
 */
@Injectable()
export class SignupGrantEligibilityService {
  private readonly context = { service: SignupGrantEligibilityService.name };

  constructor(private readonly logger: LoggerService) {}

  async evaluate(
    tx: PrismaTransactionClient,
    input: GrantEligibilityOptions & {
      isCardRequired?: boolean;
      source: string;
      userId: string;
    },
  ): Promise<SignupGrantEligibility> {
    if (!isFreeTrialEnforced()) {
      return { cardKey: null, emailKey: null, ipKey: null, isEligible: true };
    }
    const { cardKey = null, isCardRequired = false, source, userId } = input;
    const user = await tx.user.findFirst({
      select: { email: true, emailVerified: true },
      where: { id: userId, isDeleted: false },
    });
    if (!user?.emailVerified) {
      return this.refuse('email-unverified', userId, source);
    }

    const emailKey = user.email ? hashCanonicalEmail(user.email) : null;
    if (
      emailKey &&
      (await this.isKeyAlreadyGranted(tx, 'emailKey', emailKey, input))
    ) {
      return this.refuse('duplicate-mailbox', userId, source);
    }
    if (isCardRequired) {
      if (!cardKey) {
        return this.refuse('card-required', userId, source);
      }
      if (await this.isKeyAlreadyGranted(tx, 'cardKey', cardKey, input)) {
        return this.refuse('duplicate-card', userId, source);
      }
    }
    const ipKey = await this.resolveIpKey(tx, userId, input.ipAddress);
    if (ipKey && (await this.isIpOverLimit(tx, ipKey, input))) {
      return this.refuse('ip-velocity', userId, source);
    }
    return { cardKey, emailKey, ipKey, isEligible: true };
  }

  /**
   * Whether another account already collected this kind of grant under the
   * same mailbox or card key.
   */
  private async isKeyAlreadyGranted(
    tx: PrismaTransactionClient,
    field: 'cardKey' | 'emailKey',
    key: string,
    { source, userId }: { source: string; userId: string },
  ): Promise<boolean> {
    // tenant-scope-ignore: a mailbox or card may hold one grant across every organization it owns; the ledger is the only record of who already collected.
    const existing = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: a mailbox or card may hold one grant across every organization it owns; the ledger is the only record of who already collected.
        await tx.creditTransaction.findFirst({
          select: { id: true },
          where: {
            category: CreditTransactionCategory.ADD,
            isDeleted: false,
            metadata: { equals: key, path: [field] },
            organization: { userId: { not: userId } },
            source,
          },
        }),
    );
    return existing !== null;
  }

  private async resolveIpKey(
    tx: PrismaTransactionClient,
    userId: string,
    requestIpAddress?: string | null,
  ): Promise<string | null> {
    // tenant-scope-ignore: sessions are not tenant data; the signup address is read to bound how many accounts one IP may fund.
    const firstSession = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: sessions are not tenant data; the signup address is read to bound how many accounts one IP may fund.
        await tx.session.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { ipAddress: true },
          where: { ipAddress: { not: null }, userId },
        }),
    );
    const ipAddress = firstSession?.ipAddress ?? requestIpAddress;
    return ipAddress ? hashToken(ipAddress) : null;
  }

  private async isIpOverLimit(
    tx: PrismaTransactionClient,
    ipKey: string,
    { source, userId }: { source: string; userId: string },
  ): Promise<boolean> {
    // tenant-scope-ignore: counts grants across organizations whose owners share an IP address.
    const grants = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: counts grants across organizations whose owners share an IP address.
        await tx.creditTransaction.count({
          where: {
            category: CreditTransactionCategory.ADD,
            createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) },
            isDeleted: false,
            metadata: { equals: ipKey, path: ['ipKey'] },
            organization: { userId: { not: userId } },
            source,
          },
        }),
    );
    return grants >= MAX_FREE_GRANTS_PER_IP_PER_DAY;
  }

  private refuse(
    reason: SignupGrantRefusal,
    userId: string,
    source: string,
  ): SignupGrantEligibility {
    // An unverified mailbox and a missing card are the normal states of a new
    // signup before it verifies or adds a card, so they are not worth a warning.
    const log =
      reason === 'email-unverified' || reason === 'card-required'
        ? 'log'
        : 'warn';
    this.logger[log]('Free credit grant withheld', {
      ...this.context,
      reason,
      source,
      userId,
    });
    return { isEligible: false, reason };
  }
}
