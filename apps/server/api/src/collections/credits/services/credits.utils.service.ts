import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { scopedWhere } from '@api/index';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/enums';
import type {
  IAddCreditsOptions,
  ICreditReservation,
  ICreditsUtilsService,
  ICreditWalletSnapshot,
  IDeductCreditsOptions,
  IReleaseCreditReservationInput,
  IReserveCreditsInput,
  ISettleCreditReservationInput,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

type DeductCreditsCoreInput = {
  creditsToDeduct: number;
  description: string;
  options: IDeductCreditsOptions | undefined;
  organizationId: string;
  source: ActivitySource;
  url: string;
  userId: string;
};

type AddCreditsCoreInput = {
  creditsToAdd: number;
  description: string;
  expiresAt: Date;
  options: IAddCreditsOptions | undefined;
  organizationId: string;
  source: string;
};

type CreditDeductionResult = {
  newBalance: number;
  wasApplied: boolean;
};

type CreditAdditionResult = CreditDeductionResult & {
  currentBalance: number;
};

/**
 * Metered credits utility service — the real ledger, bound when
 * `usesMeteredCredits()` is true (SaaS cloud or licensed self-host). The
 * `implements ICreditsUtilsService` declaration locks the callable surface so
 * consumers depend on the contract rather than the concrete class.
 */
@Injectable()
export class CreditsUtilsService implements ICreditsUtilsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly billingAccountsService: BillingAccountsService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditReservationService: CreditReservationService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly transactionUtil: TransactionUtil,
  ) {}

  /**
   * Serializable isolation is required for the read-modify-write balance
   * cores: at the default ReadCommitted level two concurrent transactions can
   * both read the same balance and double-spend.
   */
  private static readonly BALANCE_TX_OPTIONS = {
    isolationLevel: 'Serializable',
  } as const;

  private async markOrganizationAsHavingCredits(
    organizationId: string,
  ): Promise<void> {
    const organizationSettings = await this.organizationSettingsService.findOne(
      scopedWhere(organizationId, {}),
    );

    if (organizationSettings && !organizationSettings.hasEverHadCredits) {
      await this.organizationSettingsService.patch(
        organizationSettings.id.toString(),
        {
          hasEverHadCredits: true,
        },
      );
    }
  }

  // Utitlities
  async deductCreditsFromOrganization(
    organizationId: string,
    userId: string,
    creditsToDeduct: number,
    description: string,
    source: ActivitySource = ActivitySource.SCRIPT,
    options?: IDeductCreditsOptions,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} deducting credits from organization`, {
        creditsToDeduct,
        description,
        organizationId,
        source,
        userId,
      });

      // Get organization to verify it exists
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      const { newBalance, wasApplied } =
        await this.transactionUtil.runInTransaction(
          (tx) =>
            this.deductCreditsCore(
              {
                creditsToDeduct,
                description,
                options,
                organizationId,
                source,
                url,
                userId,
              },
              tx,
            ),
          CreditsUtilsService.BALANCE_TX_OPTIONS,
        );

      if (!wasApplied) {
        this.loggerService.log(`${url} credit deduction already recorded`, {
          idempotencyKey: options?.idempotencyKey,
          organizationId,
        });
        // Replay of an already-applied deduction: the balance and ledger
        // entry are untouched, but a prior attempt may have crashed before
        // reaching cache invalidation below. Invalidate on every replay so a
        // reaper-driven retry (e.g. referrals.service.ts) can't leave the
        // access-bootstrap cache stale. Do not re-emit the websocket balance
        // event or the credits.activity event for a transaction key that was
        // already applied.
        await this.accessBootstrapCacheService.invalidateForOrganization(
          organizationId,
        );
        return;
      }

      // Balance is persisted to the credit-balance table above (epic #735,
      // Phase C — no legacy auth provider identity write-back).
      const defaultBrand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, {}),
      });

      this.eventEmitter.emit('credits.activity', {
        brandId: String(defaultBrand?.id ?? organizationId),
        key: ActivityKey.CREDITS_REMOVE,
        organizationId: organizationId,
        source,
        userId: userId,
        value: String(creditsToDeduct),
      });

      const websocketUrl = `/credits/${organizationId}`;
      await this.websocketService.emit(websocketUrl, {
        balance: newBalance,
      });
      await this.accessBootstrapCacheService.invalidateForOrganization(
        organizationId,
      );

      this.loggerService.log(`${url} credits deducted successfully`, {
        creditsDeducted: creditsToDeduct,
        organizationId,
        remainingBalance: newBalance,
        userId,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to deduct credits`, {
        creditsToDeduct,
        error,
        organizationId,
        userId,
      });
      throw error;
    }
  }

  private async deductCreditsCore(
    input: DeductCreditsCoreInput,
    tx?: PrismaTransactionClient,
  ): Promise<CreditDeductionResult> {
    const existingByIdempotencyKey = input.options?.idempotencyKey
      ? await this.findTransactionByIdempotencyKey(
          input.options.idempotencyKey,
          tx,
        )
      : null;
    if (existingByIdempotencyKey) {
      return {
        newBalance: existingByIdempotencyKey.balanceAfter ?? 0,
        wasApplied: false,
      };
    }

    if (input.options?.referenceId && input.options.referenceType) {
      const existingTransaction = tx
        ? await tx.creditTransaction.findFirst({
            where: scopedWhere(input.organizationId, {
              category: CreditTransactionCategory.DEDUCT,
              referenceId: input.options.referenceId,
              referenceType: input.options.referenceType,
            }),
          })
        : await this.creditTransactionsService.findOne(
            scopedWhere(input.organizationId, {
              category: CreditTransactionCategory.DEDUCT,
              referenceId: input.options.referenceId,
              referenceType: input.options.referenceType,
            }),
          );

      if (existingTransaction) {
        this.loggerService.log(
          `${input.url} credit deduction already recorded for reference`,
          {
            organizationId: input.organizationId,
            referenceId: input.options.referenceId,
            referenceType: input.options.referenceType,
          },
        );
        return {
          newBalance: await this.getOrganizationCreditsBalance(
            input.organizationId,
            tx,
          ),
          wasApplied: false,
        };
      }
    }

    const currentBalance = await this.getOrganizationCreditsBalance(
      input.organizationId,
      tx,
    );
    const maxOverdraftCredits = Math.max(
      0,
      input.options?.maxOverdraftCredits || 0,
    );
    const account = await this.billingAccountsService.resolveForOrganization(
      input.organizationId,
    );
    const snapshot = await this.creditBalanceService.applyDelta(
      input.organizationId,
      {
        balanceDelta: -input.creditsToDeduct,
        billingAccountId: account.id,
        maxOverdraftCredits,
      },
      tx,
    );
    const newBalance = snapshot.available;
    await this.creditTransactionsService.createTransactionEntry(
      input.organizationId,
      CreditTransactionCategory.DEDUCT,
      input.creditsToDeduct,
      currentBalance,
      newBalance,
      input.source,
      input.description,
      undefined,
      tx,
      {
        actorUserId: input.userId,
        billingAccountId: account.id,
        ...(input.options?.idempotencyKey
          ? { idempotencyKey: input.options.idempotencyKey }
          : {}),
        ...(input.options?.metadata
          ? { metadata: input.options.metadata }
          : {}),
        ...(input.options?.referenceId
          ? { referenceId: input.options.referenceId }
          : {}),
        ...(input.options?.referenceType
          ? { referenceType: input.options.referenceType }
          : {}),
      },
    );

    return { newBalance, wasApplied: true };
  }

  async checkOrganizationCreditsAvailable(
    organizationId: string,
    requiredCredits: number,
  ): Promise<boolean> {
    const currentBalance =
      await this.getOrganizationCreditsBalance(organizationId);

    return currentBalance >= requiredCredits;
  }

  async getOrganizationCreditsBalance(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<number> {
    const snapshot = await this.getWalletSnapshot(organizationId, tx);
    return snapshot.available;
  }

  async getWalletSnapshot(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot> {
    const account =
      await this.billingAccountsService.resolveForOrganization(organizationId);

    const balance = await this.creditBalanceService.getOrCreateBalance(
      organizationId,
      tx,
      account.id,
    );
    return {
      ...this.creditBalanceService.toSnapshot(balance),
      organizationId,
    };
  }

  private async getBillingWalletSnapshot(
    organizationId: string,
    tx?: PrismaTransactionClient,
  ): Promise<ICreditWalletSnapshot & { billingAccountId: string }> {
    const wallet = await this.getWalletSnapshot(organizationId, tx);
    if (!wallet.billingAccountId) {
      throw new BusinessLogicException('Billing account wallet not found');
    }
    return { ...wallet, billingAccountId: wallet.billingAccountId };
  }

  async reserveCredits(
    input: IReserveCreditsInput,
  ): Promise<ICreditReservation> {
    const account = await this.billingAccountsService.resolveForOrganization(
      input.organizationId,
    );
    return this.creditReservationService.reserve({
      ...input,
      billingAccountId: account.id,
    });
  }

  async settleReservation(
    input: ISettleCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.creditReservationService.settle(input);
  }

  async releaseReservation(
    input: IReleaseCreditReservationInput,
  ): Promise<ICreditWalletSnapshot> {
    return this.creditReservationService.release(input);
  }

  async addOrganizationCreditsWithExpiration(
    organizationId: string,
    creditsToAdd: number,
    source: string,
    description: string,
    expiresAt: Date,
    options?: IAddCreditsOptions,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} adding credits with expiration`, {
        creditsToAdd,
        description,
        expiresAt,
        organizationId,
        source,
      });

      // Get organization to verify it exists
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      const { currentBalance, newBalance, wasApplied } =
        await this.transactionUtil.runInTransaction(
          (tx) =>
            this.addCreditsCore(
              {
                creditsToAdd,
                description,
                expiresAt,
                options,
                organizationId,
                source,
              },
              tx,
            ),
          CreditsUtilsService.BALANCE_TX_OPTIONS,
        );

      if (!wasApplied) {
        this.loggerService.log(`${url} credit grant already recorded`, {
          idempotencyKey: options?.idempotencyKey,
          organizationId,
        });
        // Replay of an already-applied grant: a prior attempt committed the
        // balance/ledger write inside the serializable transaction but may
        // have crashed before reaching the side effects below (e.g. a
        // reaper-driven retry of a referral reward — see
        // referrals.service.ts). Still ensure hasEverHadCredits and the
        // access-bootstrap cache are correct on every replay; skip only the
        // websocket balance emit, since that event was already delivered for
        // this transaction key.
        if (creditsToAdd > 0) {
          await this.markOrganizationAsHavingCredits(organizationId);
        }
        await this.accessBootstrapCacheService.invalidateForOrganization(
          organizationId,
        );
        return;
      }

      if (creditsToAdd > 0) {
        await this.markOrganizationAsHavingCredits(organizationId);
      }

      // Balance is persisted to the credit-balance table above (epic #735,
      // Phase C — no legacy auth provider identity write-back).
      const websocketUrl = `/credits/${organizationId}`;
      await this.websocketService.emit(websocketUrl, {
        balance: newBalance,
      });
      await this.accessBootstrapCacheService.invalidateForOrganization(
        organizationId,
      );

      this.loggerService.log(`${url} credits added successfully`, {
        creditsAdded: creditsToAdd,
        expiresAt,
        newBalance,
        organizationId,
        previousBalance: currentBalance,
        source,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to add credits`, {
        creditsToAdd,
        error,
        organizationId,
        source,
      });
      throw error;
    }
  }

  private async addCreditsCore(
    input: AddCreditsCoreInput,
    tx?: PrismaTransactionClient,
  ): Promise<CreditAdditionResult> {
    const existing = input.options?.idempotencyKey
      ? await this.findTransactionByIdempotencyKey(
          input.options.idempotencyKey,
          tx,
        )
      : null;
    if (existing) {
      return {
        currentBalance: existing.balanceAfter ?? 0,
        newBalance: existing.balanceAfter ?? 0,
        wasApplied: false,
      };
    }

    const wallet = await this.getBillingWalletSnapshot(
      input.organizationId,
      tx,
    );
    const currentBalance = wallet.available;
    const newBalance = currentBalance + input.creditsToAdd;
    const transactionOptions =
      input.options?.idempotencyKey ||
      input.options?.referenceId ||
      input.options?.referenceType ||
      input.options?.metadata
        ? {
            ...(input.options.idempotencyKey
              ? { idempotencyKey: input.options.idempotencyKey }
              : {}),
            ...(input.options.metadata
              ? { metadata: input.options.metadata }
              : {}),
            ...(input.options.referenceId
              ? { referenceId: input.options.referenceId }
              : {}),
            ...(input.options.referenceType
              ? { referenceType: input.options.referenceType }
              : {}),
          }
        : undefined;

    await this.creditBalanceService.updateBalance(
      input.organizationId,
      newBalance,
      wallet.billingAccountId,
      tx,
    );
    const transactionArgs = [
      input.organizationId,
      CreditTransactionCategory.ADD,
      input.creditsToAdd,
      currentBalance,
      newBalance,
      input.source,
      input.description,
      input.expiresAt,
      tx,
    ] as const;
    if (transactionOptions) {
      await this.creditTransactionsService.createTransactionEntry(
        ...transactionArgs,
        transactionOptions,
      );
    } else {
      await this.creditTransactionsService.createTransactionEntry(
        ...transactionArgs,
      );
    }

    return { currentBalance, newBalance, wasApplied: true };
  }

  private findTransactionByIdempotencyKey(
    idempotencyKey: string,
    tx?: PrismaTransactionClient,
  ) {
    const where = { idempotencyKey, isDeleted: false };
    if (tx) {
      // tenant-scope-ignore: active credit-ledger idempotency keys are globally unique, so replay detection must follow that database invariant across organizations
      return tx.creditTransaction.findFirst({ where });
    }
    // tenant-scope-ignore: active credit-ledger idempotency keys are globally unique, so replay detection must follow that database invariant across organizations
    return this.prisma.creditTransaction.findFirst({ where });
  }

  async refundOrganizationCredits(
    organizationId: string,
    creditsToRefund: number,
    source: string,
    description: string,
    expiresAt: Date,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} refunding credits`, {
        creditsToRefund,
        description,
        expiresAt,
        organizationId,
        source,
      });

      // Get organization to verify it exists
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core refund logic always runs inside the required serializable transaction.
      const refundCore = async (tx?: PrismaTransactionClient) => {
        const wallet = await this.getBillingWalletSnapshot(organizationId, tx);
        const currentBalance = wallet.available;

        const newBalance = currentBalance + creditsToRefund;

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
          wallet.billingAccountId,
          tx,
        );
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.REFUND,
          creditsToRefund,
          currentBalance,
          newBalance,
          source,
          description,
          expiresAt,
          tx,
        );

        return { currentBalance, newBalance };
      };

      const { currentBalance, newBalance } =
        await this.transactionUtil.runInTransaction(
          (tx) => refundCore(tx),
          CreditsUtilsService.BALANCE_TX_OPTIONS,
        );

      // Balance is persisted to the credit-balance table above (epic #735,
      // Phase C — no legacy auth provider identity write-back).
      const websocketUrl = `/credits/${organizationId}`;
      await this.websocketService.emit(websocketUrl, {
        balance: newBalance,
      });

      this.loggerService.log(`${url} successfully refunded credits`, {
        creditsToRefund,
        newBalance,
        oldBalance: currentBalance,
        organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to refund credits`, {
        creditsToRefund,
        error,
        organizationId,
        source,
      });
      throw error;
    }
  }

  async getOrganizationCreditsWithExpiration(organizationId: string): Promise<{
    total: number;
    credits: Array<{
      balance: number;
      expiresAt?: Date;
      source?: string;
      createdAt?: Date;
    }>;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Get current balance
      const total = await this.getOrganizationCreditsBalance(organizationId);

      // Get credit transactions for context
      const transactions =
        await this.creditTransactionsService.getOrganizationTransactions(
          organizationId,
          100,
        );

      return {
        credits: transactions.map((entry) => ({
          balance: entry.amount,
          createdAt: (entry as { createdAt?: Date }).createdAt,
          expiresAt: entry.expiresAt,
          source: entry.source ?? undefined,
        })),
        total,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to get credits with expiration`, {
        error,
        organizationId,
      });
      throw error;
    }
  }

  async getCycleRemainingMetrics(
    organizationId: string,
    cycleStartAt: Date,
    cycleEndAt: Date,
    currentBalance: number,
  ): Promise<{
    cycleTotal: number;
    remainingPercent: number;
  }> {
    const previousTransaction =
      await this.creditTransactionsService.getLatestTransactionBeforeDate(
        organizationId,
        cycleStartAt,
      );

    const cycleTransactions =
      await this.creditTransactionsService.getOrganizationTransactionsInRange(
        organizationId,
        cycleStartAt,
        cycleEndAt,
      );

    const latestResetIndex = cycleTransactions.reduce(
      (latest, transaction, i) => {
        return transaction.category === CreditTransactionCategory.RESET
          ? i
          : latest;
      },
      -1,
    );

    let baseBalance = previousTransaction?.balanceAfter ?? 0;
    let startIndex = 0;

    if (latestResetIndex >= 0) {
      baseBalance = cycleTransactions[latestResetIndex]?.balanceAfter ?? 0;
      startIndex = latestResetIndex + 1;
    }

    const inflowCategories = new Set<CreditTransactionCategory>([
      CreditTransactionCategory.ADD,
      CreditTransactionCategory.REFUND,
      CreditTransactionCategory.ROLLOVER,
    ]);

    const inflows = cycleTransactions
      .slice(startIndex)
      .filter(
        (transaction) =>
          transaction.category !== undefined &&
          inflowCategories.has(transaction.category) &&
          transaction.amount > 0,
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const cycleTotal = Math.max(0, baseBalance + inflows);
    const remainingPercentRaw =
      cycleTotal > 0 ? (currentBalance / cycleTotal) * 100 : 0;
    const remainingPercent = Math.max(
      0,
      Math.min(100, Math.round(remainingPercentRaw * 100) / 100),
    );

    return { cycleTotal, remainingPercent };
  }

  async resetOrganizationCredits(
    organizationId: string,
    newCreditAmount: number,
    source: string,
    description: string,
    options?: IAddCreditsOptions,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} resetting credits for organization`, {
        description,
        newCreditAmount,
        organizationId,
        source,
      });

      // Get organization to verify it exists
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      const transactionOptions =
        options?.referenceId || options?.referenceType || options?.metadata
          ? {
              ...(options.metadata ? { metadata: options.metadata } : {}),
              ...(options.referenceId
                ? { referenceId: options.referenceId }
                : {}),
              ...(options.referenceType
                ? { referenceType: options.referenceType }
                : {}),
            }
          : undefined;

      // Core reset logic always runs inside the required serializable transaction.
      const resetCore = async (tx?: PrismaTransactionClient) => {
        const wallet = await this.getBillingWalletSnapshot(organizationId, tx);
        const currentBalance = wallet.available;

        await this.creditBalanceService.updateBalance(
          organizationId,
          newCreditAmount,
          wallet.billingAccountId,
          tx,
        );
        if (transactionOptions) {
          await this.creditTransactionsService.createTransactionEntry(
            organizationId,
            CreditTransactionCategory.RESET,
            newCreditAmount,
            currentBalance,
            newCreditAmount,
            source,
            description,
            undefined,
            tx,
            transactionOptions,
          );
        } else {
          await this.creditTransactionsService.createTransactionEntry(
            organizationId,
            CreditTransactionCategory.RESET,
            newCreditAmount,
            currentBalance,
            newCreditAmount,
            source,
            description,
            undefined,
            tx,
          );
        }

        return currentBalance;
      };

      const currentBalance = await this.transactionUtil.runInTransaction(
        (tx) => resetCore(tx),
        CreditsUtilsService.BALANCE_TX_OPTIONS,
      );

      if (newCreditAmount > 0) {
        await this.markOrganizationAsHavingCredits(organizationId);
      }

      // Balance is persisted to the credit-balance table above (epic #735,
      // Phase C — no legacy auth provider identity write-back).
      const websocketUrl = `/credits/${organizationId}`;
      await this.websocketService.emit(websocketUrl, {
        balance: newCreditAmount,
      });
      await this.accessBootstrapCacheService.invalidateForOrganization(
        organizationId,
      );

      this.loggerService.log(`${url} credits reset successfully`, {
        description,
        newBalance: newCreditAmount,
        organizationId,
        previousBalance: currentBalance,
        source,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to reset credits`, {
        error,
        newCreditAmount,
        organizationId,
        source,
      });
      throw error;
    }
  }

  async removeAllOrganizationCredits(
    organizationId: string,
    source: string,
    description: string,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} removing all credits for organization`, {
        description,
        organizationId,
        source,
      });

      // Get organization to verify it exists
      const organization = await this.prisma.organization.findFirst({
        where: { id: organizationId, isDeleted: false },
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core remove-all logic always runs inside the required serializable transaction.
      const removeAllCore = async (tx?: PrismaTransactionClient) => {
        const wallet = await this.getBillingWalletSnapshot(organizationId, tx);
        const currentBalance = wallet.available;

        await this.creditBalanceService.updateBalance(
          organizationId,
          0,
          wallet.billingAccountId,
          tx,
        );
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.DEDUCT,
          currentBalance,
          currentBalance,
          0,
          source,
          description,
          undefined,
          tx,
        );

        return currentBalance;
      };

      const currentBalance = await this.transactionUtil.runInTransaction(
        (tx) => removeAllCore(tx),
        CreditsUtilsService.BALANCE_TX_OPTIONS,
      );

      // Balance is persisted to the credit-balance table above (epic #735,
      // Phase C — no legacy auth provider identity write-back). The subscription lookup
      // is retained for the activity event below.
      const subscription = await this.prisma.subscription.findFirst({
        select: { id: true, userId: true },
        where: scopedWhere(organizationId, {}),
      });

      if (subscription?.userId) {
        const defaultBrand = await this.prisma.brand.findFirst({
          select: { id: true },
          where: scopedWhere(organizationId, {}),
        });

        this.eventEmitter.emit('credits.activity', {
          brandId: String(defaultBrand?.id ?? organizationId),
          key: ActivityKey.CREDITS_REMOVE_ALL,
          organizationId: organizationId,
          source,
          userId: subscription.userId,
          value: String(currentBalance),
        });
      }

      const websocketUrl = `/credits/${organizationId}`;
      await this.websocketService.emit(websocketUrl, { balance: 0 });
      await this.accessBootstrapCacheService.invalidateForOrganization(
        organizationId,
      );

      this.loggerService.log(`${url} all credits removed successfully`, {
        description,
        newBalance: 0,
        organizationId,
        previousBalance: currentBalance,
        source,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to remove all credits`, {
        error,
        organizationId,
        source,
      });
      throw error;
    }
  }
}
