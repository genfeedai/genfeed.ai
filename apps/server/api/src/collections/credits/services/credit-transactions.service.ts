import type { CreditTransactionsDocument } from '@api/collections/credits/schemas/credit-transactions.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CreditTransactionsService extends BaseService<CreditTransactionsDocument> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(prisma, 'creditTransaction', logger);
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
      organizationId,
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
      return (await this.delegate.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where: {
          isDeleted: { not: true },
          organizationId,
        },
      })) as unknown as CreditTransactionsDocument[];
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
      return (await this.delegate.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          createdAt: { lt: before },
          isDeleted: { not: true },
          organizationId,
        },
      })) as unknown as CreditTransactionsDocument | null;
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
      return (await this.delegate.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          isDeleted: { not: true },
          organizationId,
        },
      })) as unknown as CreditTransactionsDocument[];
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
      return (await this.delegate.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        where: {
          isDeleted: { not: true },
          organizationId,
          type,
        },
      })) as unknown as CreditTransactionsDocument[];
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
    await this.delegate.update({
      data: { isDeleted: true },
      where: { id },
    });
  }

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

      const balance =
        await this.creditBalanceService.getOrCreateBalance(organizationId);
      const currentBalance = balance?.balance || 0;

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all deductions in last 30 days
      const deductions = (await this.delegate.findMany({
        where: {
          category: CreditTransactionCategory.DEDUCT,
          createdAt: { gte: thirtyDaysAgo },
          isDeleted: { not: true },
          organizationId,
        },
      })) as Array<{ amount: number; createdAt: Date; source?: string }>;

      let usage7Days = 0;
      let usage30Days = 0;
      const sourceMap = new Map<string, { amount: number; count: number }>();

      for (const d of deductions) {
        const absAmount = Math.abs(d.amount);
        usage30Days += absAmount;
        if (d.createdAt >= sevenDaysAgo) {
          usage7Days += absAmount;
        }
        const src = d.source || 'Unknown';
        const existing = sourceMap.get(src) || { amount: 0, count: 0 };
        existing.amount += absAmount;
        existing.count += 1;
        sourceMap.set(src, existing);
      }

      const breakdown = Array.from(sourceMap.entries())
        .map(([source, data]) => ({
          amount: data.amount,
          count: data.count,
          source,
        }))
        .sort((a, b) => b.amount - a.amount);

      const dailyAvg7Days = usage7Days / 7;
      const dailyAvg30Days = usage30Days / 30;
      const trendPercentage =
        dailyAvg30Days > 0
          ? ((dailyAvg7Days - dailyAvg30Days) / dailyAvg30Days) * 100
          : 0;

      return {
        breakdown,
        currentBalance,
        trendPercentage: Math.round(trendPercentage * 100) / 100,
        usage7Days,
        usage30Days,
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getUsageMetrics failed`, {
        error,
        organizationId,
      });
      throw error;
    }
  }

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

      const latestAdd = (await this.delegate.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          category: CreditTransactionCategory.ADD,
          isDeleted: { not: true },
          organizationId,
        },
      })) as { amount: number; createdAt?: Date | null } | null;

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
        lastPurchaseAt: latestAdd.createdAt ?? null,
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
