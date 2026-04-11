import { ActivitiesService as ActivitiesServiceToken } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityKey,
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/enums';
import type { ICreditsUtilsService } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { forwardRef, Inject, Injectable, Optional } from '@nestjs/common';
import { Types } from 'mongoose';

type ActivitiesServiceContract = {
  create: (
    payload: Parameters<ActivitiesServiceToken['create']>[0],
  ) => ReturnType<ActivitiesServiceToken['create']>;
};

/**
 * Enterprise credits utility service. The full implementation lives in OSS
 * today and moves to `ee/packages/billing/` in Phase C Layer 2 (tracked in
 * issue #87). The `implements ICreditsUtilsService` declaration locks the
 * OSS-callable surface so consumers can depend on the contract rather than
 * the concrete class.
 */
@Injectable()
export class CreditsUtilsService implements ICreditsUtilsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Inject(forwardRef(() => ActivitiesServiceToken))
    private readonly activitiesService: ActivitiesServiceContract,
    private readonly brandsService: BrandsService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly creditTransactionsService: CreditTransactionsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly organizationsService: OrganizationsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly usersService: UsersService,
    private readonly clerkService: ClerkService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    @Optional() private readonly transactionUtil?: TransactionUtil,
  ) {}

  private async markOrganizationAsHavingCredits(
    organizationId: string,
  ): Promise<void> {
    const organizationSettings = await this.organizationSettingsService.findOne(
      {
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      },
    );

    if (organizationSettings && !organizationSettings.hasEverHadCredits) {
      await this.organizationSettingsService.patch(
        organizationSettings._id.toString(),
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
    options?: { maxOverdraftCredits?: number },
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
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core deduction logic — runs atomically inside a transaction when available
      const deductCore = async () => {
        const currentBalance =
          await this.getOrganizationCreditsBalance(organizationId);

        const maxOverdraftCredits = Math.max(
          0,
          options?.maxOverdraftCredits || 0,
        );
        const newBalance = currentBalance - creditsToDeduct;

        if (newBalance < -maxOverdraftCredits) {
          throw new BusinessLogicException(
            `Insufficient organization credits. Available: ${currentBalance}, Required: ${creditsToDeduct}, Max overdraft: ${maxOverdraftCredits}`,
          );
        }

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
        );
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.DEDUCT,
          creditsToDeduct,
          currentBalance,
          newBalance,
          source,
          description,
        );

        return newBalance;
      };

      // Use transaction if available (requires replica set), otherwise fallback
      const newBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(() => deductCore())
        : await deductCore();

      // Side effects outside transaction (idempotent, non-critical)
      const dbUser = await this.usersService.findOne({
        _id: new Types.ObjectId(userId),
      });
      if (dbUser?.clerkId) {
        await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
          balance: newBalance,
        });
      }

      const defaultBrand = await this.brandsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });

      await this.activitiesService.create({
        brand: defaultBrand?._id ?? new Types.ObjectId(organizationId),
        key: ActivityKey.CREDITS_REMOVE,
        organization: new Types.ObjectId(organizationId),
        source,
        user: new Types.ObjectId(userId),
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

  async getOrganizationCreditsBalance(organizationId: string): Promise<number> {
    const balance =
      await this.creditBalanceService.findByOrganization(organizationId);
    return balance?.balance || 0;
  }

  async addOrganizationCreditsWithExpiration(
    organizationId: string,
    creditsToAdd: number,
    source: string,
    description: string,
    expiresAt: Date,
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
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core add logic — runs atomically inside a transaction when available
      const addCore = async () => {
        const currentBalance =
          await this.getOrganizationCreditsBalance(organizationId);

        const newBalance = currentBalance + creditsToAdd;

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
        );
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.ADD,
          creditsToAdd,
          currentBalance,
          newBalance,
          source,
          description,
          expiresAt,
        );

        return { currentBalance, newBalance };
      };

      // Use transaction if available (requires replica set), otherwise fallback
      const { currentBalance, newBalance } = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(() => addCore())
        : await addCore();

      if (creditsToAdd > 0) {
        await this.markOrganizationAsHavingCredits(organizationId);
      }

      // Side effects outside transaction (idempotent, non-critical)
      const subscription =
        await this.subscriptionsService.findByOrganizationId(organizationId);
      if (subscription?.user) {
        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });
        if (dbUser?.clerkId) {
          await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
            balance: newBalance,
          });
        }
      }

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
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core refund logic — runs atomically inside a transaction when available
      const refundCore = async () => {
        const currentBalance =
          await this.getOrganizationCreditsBalance(organizationId);

        const newBalance = currentBalance + creditsToRefund;

        await this.creditBalanceService.updateBalance(
          organizationId,
          newBalance,
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
        );

        return { currentBalance, newBalance };
      };

      // Use transaction if available (requires replica set), otherwise fallback
      const { currentBalance, newBalance } = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(() => refundCore())
        : await refundCore();

      // Side effects outside transaction (idempotent, non-critical)
      const subscription =
        await this.subscriptionsService.findByOrganizationId(organizationId);
      if (subscription?.user) {
        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });
        if (dbUser?.clerkId) {
          await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
            balance: newBalance,
          });
        }
      }

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
          source: entry.source,
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
          inflowCategories.has(transaction.category) && transaction.amount > 0,
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
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core reset logic — runs atomically inside a transaction when available
      const resetCore = async () => {
        const currentBalance =
          await this.getOrganizationCreditsBalance(organizationId);

        await this.creditBalanceService.updateBalance(
          organizationId,
          newCreditAmount,
        );
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.RESET,
          newCreditAmount,
          currentBalance,
          newCreditAmount,
          source,
          description,
        );

        return currentBalance;
      };

      // Use transaction if available (requires replica set), otherwise fallback
      const currentBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(() => resetCore())
        : await resetCore();

      if (newCreditAmount > 0) {
        await this.markOrganizationAsHavingCredits(organizationId);
      }

      // Side effects outside transaction (idempotent, non-critical)
      const subscription =
        await this.subscriptionsService.findByOrganizationId(organizationId);
      if (subscription?.user) {
        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });
        if (dbUser?.clerkId) {
          await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
            balance: newCreditAmount,
          });
        }
      }

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
      const organization = await this.organizationsService.findOne({
        _id: new Types.ObjectId(organizationId),
      });

      if (!organization) {
        throw new BusinessLogicException('Organization not found');
      }

      // Core remove-all logic — runs atomically inside a transaction when available
      const removeAllCore = async () => {
        const currentBalance =
          await this.getOrganizationCreditsBalance(organizationId);

        await this.creditBalanceService.updateBalance(organizationId, 0);
        await this.creditTransactionsService.createTransactionEntry(
          organizationId,
          CreditTransactionCategory.DEDUCT,
          currentBalance,
          currentBalance,
          0,
          source,
          description,
        );

        return currentBalance;
      };

      // Use transaction if available (requires replica set), otherwise fallback
      const currentBalance = this.transactionUtil
        ? await this.transactionUtil.runInTransaction(() => removeAllCore())
        : await removeAllCore();

      // Side effects outside transaction (idempotent, non-critical)
      const subscription =
        await this.subscriptionsService.findByOrganizationId(organizationId);
      if (subscription?.user) {
        const dbUser = await this.usersService.findOne({
          _id: subscription.user,
        });
        if (dbUser?.clerkId) {
          await this.clerkService.updateUserPublicMetadata(dbUser.clerkId, {
            balance: 0,
          });
        }
      }

      if (subscription?.user) {
        const defaultBrand = await this.brandsService.findOne({
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        });

        await this.activitiesService.create({
          brand: defaultBrand?._id ?? new Types.ObjectId(organizationId),
          key: ActivityKey.CREDITS_REMOVE_ALL,
          organization: new Types.ObjectId(organizationId),
          source,
          user: new Types.ObjectId(subscription.user),
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
