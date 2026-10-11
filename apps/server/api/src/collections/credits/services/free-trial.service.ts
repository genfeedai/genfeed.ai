import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { isCreditTransactionConflict } from '@api/collections/credits/services/credit-transaction-conflict';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import {
  isFreeTrialEnforced,
  paidSubscriptionWhere,
  readFreeTrialState,
  trialExemptingGrantWhere,
} from '@api/collections/credits/services/free-trial-state.util';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { FreeTrialExpiredException } from '@api/exceptions/business-logic.exception';
import {
  type PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import {
  FREE_TRIAL_DURATION_MS,
  resolveFreeTrialEndsAt,
  resolveFreeTrialRolloutAt,
} from '@genfeedai/contracts/constants';
import type { IFreeTrialState } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { Injectable } from '@nestjs/common';

const TRIAL_REFERENCE_TYPE = 'free-trial';
/**
 * Paying is permanent, so an exempt verdict is safe to reuse for a while. It
 * keeps the admission check to one cheap read for paid organizations.
 */
const EXEMPT_CACHE_TTL_MS = 10 * 60 * 1000;
const EXEMPT_CACHE_MAX_ENTRIES = 10_000;
const MAX_SERIALIZATION_ATTEMPTS = 3;

type TrialExpiryOutcome = {
  balance: number;
  expiredCredits: number;
};

/**
 * The 3-day hosted free trial (`FREE_TRIAL_DURATION_MS` from organization
 * creation). An organization that never paid keeps its free credits until the
 * trial ends; afterwards every credit admission is refused and the
 * trial-expiry sweep removes what is left. Credits stay one pooled balance —
 * a grant's `expiresAt` is metadata only — so expiry debits the pool through
 * the normal ledger path with an `EXPIRE` entry.
 */
@Injectable()
export class FreeTrialService {
  private readonly context = { service: FreeTrialService.name };
  private readonly exemptUntil = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionUtil: TransactionUtil,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly notificationsPublisher: NotificationsPublisherService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly logger: LoggerService,
    private readonly config: ConfigService,
  ) {}

  /** `FREE_TRIAL_ROLLOUT_AT`, or the default rollout moment. */
  get rolloutAt(): Date {
    return resolveFreeTrialRolloutAt(this.config.get('FREE_TRIAL_ROLLOUT_AT'));
  }

  getState(
    organizationId: string,
    now: Date = new Date(),
    client: PrismaTransactionClient = this.prisma,
  ): Promise<IFreeTrialState> {
    return readFreeTrialState(client, organizationId, now, this.rolloutAt);
  }

  /**
   * Authoritative admission check: throws once a never-paid organization is
   * past its trial, whether or not the sweep has removed its credits yet. An
   * organization still inside its window costs one indexed read.
   */
  async assertTrialActive(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const trialEndsAt = await this.findExpiredTrialEnd(organizationId, now);
    if (trialEndsAt) {
      throw new FreeTrialExpiredException(trialEndsAt);
    }
  }

  async isTrialExpired(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    return (await this.findExpiredTrialEnd(organizationId, now)) !== null;
  }

  /**
   * Organizations the sweep should look at: past the window, never paid,
   * not operator-provisioned, with a positive settled balance. `getState`
   * re-checks each one inside the expiry transaction.
   */
  async findExpiryCandidates(
    now: Date,
    afterOrganizationId: string | undefined,
    take: number,
  ): Promise<string[]> {
    if (!isFreeTrialEnforced()) {
      return [];
    }
    // Nobody's window can have closed before rollout + 72h.
    if (now.getTime() < this.rolloutAt.getTime() + FREE_TRIAL_DURATION_MS) {
      return [];
    }
    const createdBefore = new Date(now.getTime() - FREE_TRIAL_DURATION_MS);
    // tenant-scope-ignore: the trial-expiry sweep discovers organization ids across tenants; each id is then expired in its own organization-scoped transaction.
    const wallets = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: the trial-expiry sweep discovers organization ids across tenants; each id is then expired in its own organization-scoped transaction.
        await this.prisma.creditBalance.findMany({
          orderBy: { organizationId: 'asc' },
          select: { organizationId: true },
          take,
          where: {
            balance: { gt: 0 },
            isDeleted: false,
            organization: {
              is: {
                createdAt: { lte: createdBefore },
                creditTransactions: { none: trialExemptingGrantWhere() },
                isDeleted: false,
                isProactiveOnboarding: false,
                subscriptions: { none: paidSubscriptionWhere() },
                warmupAccounts: { none: { isDeleted: false } },
              },
            },
            organizationId: afterOrganizationId
              ? { gt: afterOrganizationId, not: null }
              : { not: null },
          },
        }),
    );
    return wallets.flatMap((wallet) =>
      wallet.organizationId ? [wallet.organizationId] : [],
    );
  }

  /**
   * Debits whatever is spendable from a never-paid organization's own wallet
   * once its trial is over. Re-running it is a no-op: the second pass finds
   * nothing spendable (and the wallet version in the ledger key fences a
   * concurrent duplicate). Credits held by an in-flight generation are left
   * for that generation to settle or release; the next sweep collects a
   * release. Returns the number of credits that expired.
   */
  async expireTrialCredits(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<number> {
    if (!isFreeTrialEnforced()) {
      return 0;
    }
    const outcome = await this.runSerializable((tx) =>
      this.expireInTransaction(organizationId, now, tx),
    );
    if (!outcome) {
      return 0;
    }
    await this.notificationsPublisher.emit(`/credits/${organizationId}`, {
      balance: outcome.balance,
    });
    await this.accessBootstrapCacheService.invalidateForOrganization(
      organizationId,
    );
    this.logger.log('Expired free-trial credits', {
      ...this.context,
      expiredCredits: outcome.expiredCredits,
      organizationId,
    });
    return outcome.expiredCredits;
  }

  private async expireInTransaction(
    organizationId: string,
    now: Date,
    tx: PrismaTransactionClient,
  ): Promise<TrialExpiryOutcome | null> {
    const state = await this.getState(organizationId, now, tx);
    if (!state.isTrialExpired || !state.trialEndsAt) {
      return null;
    }
    const wallet = await tx.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    if (!wallet) {
      return null;
    }
    const before = this.creditBalanceService.toSnapshot(wallet);
    if (!(before.available > 0)) {
      return null;
    }
    const billingAccountId = wallet.billingAccountId ?? undefined;
    const after = await this.creditBalanceService.applyDelta(
      organizationId,
      { balanceDelta: -before.available, billingAccountId },
      tx,
    );
    await this.creditTransactionsService.createTransactionEntry(
      organizationId,
      CreditTransactionCategory.EXPIRE,
      before.available,
      before.available,
      after.available,
      ActivitySource.TRIAL_EXPIRED,
      'Free trial ended: unused free credits expired',
      undefined,
      tx,
      {
        ...(billingAccountId ? { billingAccountId } : {}),
        idempotencyKey: `free-trial-expired:${organizationId}:${before.version}`,
        metadata: { trialEndsAt: state.trialEndsAt.toISOString() },
        referenceId: organizationId,
        referenceType: TRIAL_REFERENCE_TYPE,
      },
    );
    return { balance: after.available, expiredCredits: before.available };
  }

  private async findExpiredTrialEnd(
    organizationId: string,
    now: Date,
  ): Promise<Date | null> {
    if (!isFreeTrialEnforced() || !organizationId) {
      return null;
    }
    const cachedUntil = this.exemptUntil.get(organizationId);
    if (cachedUntil !== undefined && cachedUntil > now.getTime()) {
      return null;
    }
    const organization = await this.prisma.organization.findFirst({
      select: { createdAt: true },
      where: { id: organizationId, isDeleted: false },
    });
    if (
      !organization ||
      resolveFreeTrialEndsAt(organization.createdAt, this.rolloutAt).getTime() >
        now.getTime()
    ) {
      return null;
    }
    const state = await this.getState(organizationId, now);
    if (!state.trialEndsAt) {
      this.rememberExempt(organizationId, now);
      return null;
    }
    return state.isTrialExpired ? state.trialEndsAt : null;
  }

  private rememberExempt(organizationId: string, now: Date): void {
    if (this.exemptUntil.size >= EXEMPT_CACHE_MAX_ENTRIES) {
      this.exemptUntil.clear();
    }
    this.exemptUntil.set(organizationId, now.getTime() + EXEMPT_CACHE_TTL_MS);
  }

  private async runSerializable<T>(
    operation: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.transactionUtil.runInTransaction(operation, {
          isolationLevel: 'Serializable',
        });
      } catch (error: unknown) {
        if (
          !isCreditTransactionConflict(error) ||
          attempt >= MAX_SERIALIZATION_ATTEMPTS
        ) {
          throw error;
        }
      }
    }
  }
}
