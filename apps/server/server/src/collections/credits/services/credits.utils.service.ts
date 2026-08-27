import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditBalanceService } from '@server/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@server/collections/credits/services/credit-transactions.service';
import { OrganizationSettingsService } from '@server/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@server/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@server/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@server/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@server/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
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
} from '@genfeedai/interfaces/billing';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    @Optional() private readonly transactionUtil?: TransactionUtil,
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
    options?: {
      maxOverdraftCredits?: number;
      metadata?: Record<string, unknown>;
      referenceId?: string;
      referenceType?: string;
    },
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

      // Core deduction logic — runs atomically inside a transaction when available
      const deductCore = async (tx?: PrismaTransactionClient) => {
        if (options?.referenceId && options.referenceType) {
          const existingTransaction = tx
            ? await tx.creditTransaction.findFirst({
                where: scopedWhere(organizationId, {
                  category: CreditTransactionCategory.DEDUCT,
                  referenceId: options.referenceId,
                  referenceType: options.referenceType,
                }),
              })
            : await this.creditTransactionsService.findOne(
                scopedWhere(organizationId, {
                  category: CreditTransactionCategory.DEDUCT,
                  referenceId: options.referenceId,
                  referenceType: options.referenceType,
                }),
              );

          if (existingTransaction) {
            this.loggerService.log(
              `${url} credit deduction already recorded for reference`,
              {
                organizationId,
                referenceId: options.referenceId,
                referenceType: options.referenceType,
              },
            );
            return this.getOrganizationCreditsBalance(organizationId, tx);
          }
        }

        const currentBalance = await this.getOrganizationCreditsBalance(
          organizationId,
          tx,
        );
        const maxOverdraftCredits = Math.max(
          0,
          options?.maxOverdraftCredits || 0,
        );
        const account =
          await this.billingAccountsService.resolveForOrganization(
            organizationId,
          );
        const snapshot = await this.creditBalanceService.applyDelta(
          organizationId,
          {
            balanceDelta: -creditsToDeduct,
            billingAccountId: account.id,
            maxOverdraftCredits,
          },
          tx,
        );
        const newBalance = snapshot.available;
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.DEDUCT,
          creditsToDeduct,
          currentBalance,
          newBalance,
          source,
          description,
          undefined,
          tx,
          {
            actorUserId: userId,
            billingAccountId: account.id,
            ...(options?.metadata ? { metadata: options.metadata } : {}),
            ...(options?.referenceId
              ? { referenceId: options.referenceId }
              : {}),
            ...(options?.referenceType
              ? { referenceType: options.referenceType }
              : {}),
          },
        );

        return newBalance;
      };

      // Use transaction if available, otherwise fallback
      const newBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(
            (tx) => deductCore(tx),
            CreditsUtilsService.BALANCE_TX_OPTIONS,
          )
        : await deductCore();

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
    let billingAccountId: string | null = null;
    try {
      const account =
        await this.billingAccountsService.resolveForOrganization(
          organizationId,
        );
      billingAccountId = account.id;
    } catch {
      billingAccountId = null;
    }

    const balance = await this.creditBalanceService.getOrCreateBalance(
      organizationId,
      tx,
      billingAccountId,
    );
    return this.creditBalanceService.toSnapshot(balance);
  }

  async reserveCredits(input: {
    organizationId: string;
    actorUserId: string;
    amount: number;
    idempotencyKey: string;
    workloadType?: string;
    workloadId?: string;
    expiresAt?: Date;
  }): Promise<ICreditReservation> {
    const account = await this.billingAccountsService.resolveForOrganization(
      input.organizationId,
    );
    return this.creditReservationService.reserve({
      ...input,
      billingAccountId: account.id,
    });
  }

  async settleReservation(input: {
    reservationId?: string;
    idempotencyKey?: string;
    actualAmount: number;
    actorUserId: string;
    description: string;
    source?: ActivitySource;
  }): Promise<ICreditWalletSnapshot> {
    return this.creditReservationService.settle(input);
  }

  async releaseReservation(input: {
    reservationId?: string;
    idempotencyKey?: string;
    reason?: 'release' | 'expiry';
  }): Promise<ICreditWalletSnapshot> {
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

      // Core add logic — runs atomically inside a transaction when available
      const addCore = async (tx?: PrismaTransactionClient) => {
        const currentBalance = await this.getOrganizationCreditsBalance(
          organizationId,
          tx,
        );

        const newBalance = currentBalance + creditsToAdd;
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

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
          tx,
        );
        if (transactionOptions) {
          await this.creditTransactionsService.createTransactionEntry(
            organizationId,
            CreditTransactionCategory.ADD,
            creditsToAdd,
            currentBalance,
            newBalance,
            source,
            description,
            expiresAt,
            tx,
            transactionOptions,
          );
        } else {
          await this.creditTransactionsService.createTransactionEntry(
            organizationId,
            CreditTransactionCategory.ADD,
            creditsToAdd,
            currentBalance,
            newBalance,
            source,
            description,
            expiresAt,
            tx,
          );
        }

        return { currentBalance, newBalance };
      };

      // Use transaction if available, otherwise fallback
      const { currentBalance, newBalance } = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(
            (tx) => addCore(tx),
            CreditsUtilsService.BALANCE_TX_OPTIONS,
          )
        : await addCore();

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

      // Core refund logic — runs atomically inside a transaction when available
      const refundCore = async (tx?: PrismaTransactionClient) => {
        const currentBalance = await this.getOrganizationCreditsBalance(
          organizationId,
          tx,
        );

        const newBalance = currentBalance + creditsToRefund;

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
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

      // Use transaction if available, otherwise fallback
      const { currentBalance, newBalance } = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(
            (tx) => refundCore(tx),
            CreditsUtilsService.BALANCE_TX_OPTIONS,
          )
        : await refundCore();

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

      // Core reset logic — runs atomically inside a transaction when available
      const resetCore = async (tx?: PrismaTransactionClient) => {
        const currentBalance = await this.getOrganizationCreditsBalance(
          organizationId,
          tx,
        );

        await this.creditBalanceService.updateBalance(
          organizationId,
          newCreditAmount,
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

      // Use transaction if available, otherwise fallback
      const currentBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(
            (tx) => resetCore(tx),
            CreditsUtilsService.BALANCE_TX_OPTIONS,
          )
        : await resetCore();

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

      // Core remove-all logic — runs atomically inside a transaction when available
      const removeAllCore = async (tx?: PrismaTransactionClient) => {
        const currentBalance = await this.getOrganizationCreditsBalance(
          organizationId,
          tx,
        );

        await this.creditBalanceService.updateBalance(organizationId, 0, tx);
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

      // Use transaction if available, otherwise fallback
      const currentBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(
            (tx) => removeAllCore(tx),
            CreditsUtilsService.BALANCE_TX_OPTIONS,
          )
        : await removeAllCore();

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
