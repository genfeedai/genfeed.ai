import {
  CreditTransactions,
  type CreditTransactionsDocument,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class CreditTransactionsService extends BaseService<CreditTransactionsDocument> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(CreditTransactions.name, DB_CONNECTIONS.AUTH)
    protected readonly model: AggregatePaginateModel<CreditTransactionsDocument>,
    public readonly logger: LoggerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(model, logger);
  }

  async createTransactionEntry(
    organizationId: string,
    category: CreditTransactionCategory,
    amount: number,
    balanceBefore: number,
    balanceAfter: number,
    source?: string,
    description?: string,
    expiresAt?: Date,
  ): Promise<CreditTransactionsDocument> {
    if (
      !organizationId ||
      category === undefined ||
      category === null ||
      typeof amount !== 'number' ||
      Number.isNaN(amount) ||
      typeof balanceBefore !== 'number' ||
      Number.isNaN(balanceBefore) ||
      typeof balanceAfter !== 'number' ||
      Number.isNaN(balanceAfter)
    ) {
      this.logger.error(
        `${this.constructorName} createTransactionEntry called with invalid params`,
        {
          amount,
          balanceAfter,
          balanceBefore,
          category,
          organizationId,
          source,
        },
      );
      throw new BusinessLogicException(
        'Cannot create credit transaction: missing required fields',
        { amount, balanceAfter, balanceBefore, category, organizationId },
        'INVALID_CREDIT_TRANSACTION',
      );
    }

    const result = await this.create({
      amount,
      balanceAfter,
      balanceBefore,
      category,
      description,
      expiresAt,
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      source,
    } as Record<string, unknown>);

    await this.cacheInvalidationService.invalidate(
      CACHE_PATTERNS.CREDITS_USAGE(organizationId),
      CACHE_PATTERNS.CREDITS_BYOK(organizationId),
      CACHE_PATTERNS.CREDITS_LAST_PURCHASE_BASELINE(organizationId),
    );

    return result;
  }

  async getOrganizationTransactions(
    organizationId: string,
    limit: number = 100,
    skip: number = 0,
  ): Promise<CreditTransactionsDocument[]> {
    try {
      return await this.model
        .find({
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .exec();
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getOrganizationTransactions failed`,
        {
          error,
          limit,
          organizationId,
          skip,
        },
      );

      throw error;
    }
  }

  async getLatestTransactionBeforeDate(
    organizationId: string,
    before: Date,
  ): Promise<CreditTransactionsDocument | null> {
    try {
      return await this.model
        .findOne({
          createdAt: { $lt: before },
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
        })
        .sort({ createdAt: -1 })
        .exec();
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getLatestTransactionBeforeDate failed`,
        {
          before,
          error,
          organizationId,
        },
      );
      throw error;
    }
  }

  async getOrganizationTransactionsInRange(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CreditTransactionsDocument[]> {
    try {
      return await this.model
        .find({
          createdAt: { $gte: startDate, $lte: endDate },
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
        })
        .sort({ createdAt: 1 })
        .exec();
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getOrganizationTransactionsInRange failed`,
        {
          endDate,
          error,
          organizationId,
          startDate,
        },
      );
      throw error;
    }
  }

  async getTransactionsByType(
    organizationId: string,
    type: string,
    limit = 100,
  ): Promise<CreditTransactionsDocument[]> {
    try {
      return await this.model
        .find({
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
          type,
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getTransactionsByType failed`,
        {
          error,
          limit,
          organizationId,
          type,
        },
      );

      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, {
      isDeleted: true,
    });
  }

  /**
   * Get usage metrics for credits
   * Returns 7-day usage, 30-day usage, current balance, trend, and breakdown by source
   */
  async getUsageMetrics(organizationId: string): Promise<{
    currentBalance: number;
    usage7Days: number;
    usage30Days: number;
    trendPercentage: number;
    breakdown: Array<{ source: string; amount: number; count: number }>;
  }> {
    try {
      this.logger.debug(`${this.constructorName} getUsageMetrics`, {
        organizationId,
      });

      // Get current balance
      const balance =
        await this.creditBalanceService.getOrCreateBalance(organizationId);
      const currentBalance = balance?.balance || 0;

      // Calculate dates for 7 and 30 days ago
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Aggregate usage for last 30 days (includes DEDUCT transactions)
      const usage = await this.model.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: { $ne: true },
            organization: new Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: null,
            usage7Days: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', sevenDaysAgo] },
                  { $abs: '$amount' },
                  0,
                ],
              },
            },
            usage30Days: {
              $sum: { $abs: '$amount' },
            },
          },
        },
      ]);

      const usageData = usage[0] || { usage7Days: 0, usage30Days: 0 };

      // Get breakdown by source for last 30 days
      const breakdown = await this.model.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: { $ne: true },
            organization: new Types.ObjectId(organizationId),
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$source', 'Unknown'] },
            amount: { $sum: { $abs: '$amount' } },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            amount: 1,
            count: 1,
            source: '$_id',
          },
        },
        {
          $sort: { amount: -1 },
        },
      ]);

      // Calculate trend percentage (7-day vs 30-day daily average)
      const dailyAvg7Days = usageData.usage7Days / 7;
      const dailyAvg30Days = usageData.usage30Days / 30;
      const trendPercentage =
        dailyAvg30Days > 0
          ? ((dailyAvg7Days - dailyAvg30Days) / dailyAvg30Days) * 100
          : 0;

      return {
        breakdown,
        currentBalance,
        trendPercentage: Math.round(trendPercentage * 100) / 100,
        usage7Days: usageData.usage7Days,
        usage30Days: usageData.usage30Days,
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getUsageMetrics failed`, {
        error,
        organizationId,
      });
      throw error;
    }
  }

  /**
   * Get baseline usage since the latest top-up purchase.
   * Baseline is defined by the most recent ADD transaction amount.
   */
  async getLastPurchaseBaseline(organizationId: string): Promise<{
    lastPurchaseCredits: number;
    usedSinceLastPurchase: number;
    currentBalance: number;
    usedPercent: number;
    lastPurchaseAt: Date | null;
  }> {
    try {
      this.logger.debug(`${this.constructorName} getLastPurchaseBaseline`, {
        organizationId,
      });

      const balance =
        await this.creditBalanceService.getOrCreateBalance(organizationId);
      const currentBalance = balance?.balance || 0;

      const latestAdd = await this.model
        .findOne({
          category: CreditTransactionCategory.ADD,
          isDeleted: { $ne: true },
          organization: new Types.ObjectId(organizationId),
        })
        .sort({ createdAt: -1 })
        .exec();

      if (!latestAdd) {
        return {
          currentBalance,
          lastPurchaseAt: null,
          lastPurchaseCredits: 0,
          usedPercent: 0,
          usedSinceLastPurchase: 0,
        };
      }

      const lastPurchaseCredits = Math.max(
        Number.isFinite(latestAdd.amount) ? latestAdd.amount : 0,
        0,
      );
      const usedSinceLastPurchase = Math.max(
        lastPurchaseCredits - currentBalance,
        0,
      );
      const usedPercent =
        lastPurchaseCredits > 0
          ? Math.round((usedSinceLastPurchase / lastPurchaseCredits) * 100)
          : 0;

      return {
        currentBalance,
        lastPurchaseAt:
          (latestAdd as { createdAt?: Date | null }).createdAt ?? null,
        lastPurchaseCredits,
        usedPercent,
        usedSinceLastPurchase,
      };
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getLastPurchaseBaseline failed`,
        {
          error,
          organizationId,
        },
      );
      throw error;
    }
  }
}
