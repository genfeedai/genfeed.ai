import type { CreditTransactionsDocument } from '@api/collections/credits/schemas/credit-transactions.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CACHE_PATTERNS } from '@api/common/constants/cache-patterns.constants';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CreateTransactionEntryOptions = {
  actorUserId?: string;
  billingAccountId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  referenceId?: string;
  reservationId?: string;
  referenceType?: string;
};

@Injectable()
export class CreditTransactionsService extends BaseService<
  CreditTransactionsDocument,
  Partial<CreditTransactionsDocument>,
  Partial<CreditTransactionsDocument>,
  Prisma.CreditTransactionWhereInput
> {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly cacheInvalidationService: CacheInvalidationService,
  ) {
    super(prisma, 'creditTransaction', logger);
  }

  private toDate(value: unknown): Date | undefined {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private readBalanceValue(balance?: { balance?: number } | null): number {
    return typeof balance?.balance === 'number' ? balance.balance : 0;
  }

  protected override normalizeDocument(
    document: unknown,
  ): CreditTransactionsDocument {
    const normalized = super.normalizeDocument(
      document,
    ) as CreditTransactionsDocument;

    return {
      ...normalized,
      expiresAt: this.toDate(normalized.expiresAt),
    };
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
    tx?: PrismaTransactionClient,
    options?: CreateTransactionEntryOptions,
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

    const data: Prisma.CreditTransactionUncheckedCreateInput = {
      amount,
      balanceAfter,
      category,
      description,
      isDeleted: false,
      metadata: toPrismaJson({
        ...(options?.metadata ?? {}),
        balanceBefore,
        category,
        ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      }),
      organizationId,
      ...(options?.actorUserId ? { actorUserId: options.actorUserId } : {}),
      ...(options?.billingAccountId
        ? { billingAccountId: options.billingAccountId }
        : {}),
      ...(options?.idempotencyKey
        ? { idempotencyKey: options.idempotencyKey }
        : {}),
      ...(options?.referenceId ? { referenceId: options.referenceId } : {}),
      ...(options?.reservationId
        ? { reservationId: options.reservationId }
        : {}),
      ...(options?.referenceType
        ? { referenceType: options.referenceType }
        : {}),
      source,
    };

    // When a transaction client is supplied, the ledger entry MUST be written
    // through it so it commits/rolls back atomically with the balance update.
    const created = tx
      ? await tx.creditTransaction.create({ data })
      : await this.prisma.creditTransaction.create({ data });
    const result = this.normalizeDocument(created);

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
    filters?: {
      brandId?: string;
      category?: string;
      source?: string;
    },
  ): Promise<CreditTransactionsDocument[]> {
    try {
      const brandId = filters?.brandId?.trim();
      const category = filters?.category?.trim();
      const source = filters?.source?.trim();

      const where: Prisma.CreditTransactionWhereInput = {
        isDeleted: false,
        organizationId,
        ...(category ? { category } : {}),
        ...(source ? { source } : {}),
        // brandId is stored on ledger metadata when callers pass it through.
        ...(brandId
          ? {
              metadata: {
                path: ['brandId'],
                equals: brandId,
              } satisfies Prisma.JsonFilter,
            }
          : {}),
      };
      const results = await this.delegate.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        where,
      });
      return this.normalizeDocuments(results as unknown[]);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} getOrganizationTransactions failed`,
        {
          error,
          filters,
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
      const result = await this.delegate.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          createdAt: { lt: before },
          isDeleted: false,
          organizationId,
        },
      });
      return result ? this.normalizeDocument(result) : null;
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
      const results = await this.delegate.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          createdAt: { gte: startDate, lte: endDate },
          isDeleted: false,
          organizationId,
        },
      });
      return this.normalizeDocuments(results as unknown[]);
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
          isDeleted: false,
          organizationId,
          // Stage 4: the transaction-type column is `source` (Prisma); `type`
          // was a Mongo-era name that silently matched nothing.
          source: type,
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
    dailySeries: Array<{ date: string; amount: number }>;
    weeklySeries: Array<{ date: string; amount: number }>;
    monthlySeries: Array<{ date: string; amount: number }>;
  }> {
    try {
      this.logger.debug(`${this.constructorName} getUsageMetrics`, {
        organizationId,
      });

      const balance =
        await this.creditBalanceService.getOrCreateBalance(organizationId);
      const currentBalance = this.readBalanceValue(balance);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      // Look back a year so monthly/weekly charts have enough buckets.
      const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

      const deductions = this.normalizeDocuments(
        (await this.delegate.findMany({
          where: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { gte: yearAgo },
            isDeleted: false,
            organizationId,
          },
        })) as unknown[],
      );

      let usage7Days = 0;
      let usage30Days = 0;
      const sourceMap = new Map<string, { amount: number; count: number }>();
      const byDay = new Map<string, number>();

      for (const d of deductions) {
        const absAmount = Math.abs(Number(d.amount) || 0);
        const createdAt =
          d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt);

        if (createdAt >= thirtyDaysAgo) {
          usage30Days += absAmount;
        }
        if (createdAt >= sevenDaysAgo) {
          usage7Days += absAmount;
        }

        // Source breakdown is still a 30-day window for the cards.
        if (createdAt >= thirtyDaysAgo) {
          const src = d.source || 'Unknown';
          const existing = sourceMap.get(src) || { amount: 0, count: 0 };
          existing.amount += absAmount;
          existing.count += 1;
          sourceMap.set(src, existing);
        }

        const dayKey = this.toUtcDayKey(createdAt);
        byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + absAmount);
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
        dailySeries: this.buildDailySeries(byDay, now, 30),
        monthlySeries: this.buildMonthlySeries(byDay, now, 12),
        trendPercentage: Math.round(trendPercentage * 100) / 100,
        usage30Days,
        usage7Days,
        weeklySeries: this.buildWeeklySeries(byDay, now, 12),
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getUsageMetrics failed`, {
        error,
        organizationId,
      });
      throw error;
    }
  }

  private toUtcDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private buildDailySeries(
    byDay: Map<string, number>,
    now: Date,
    days: number,
  ): Array<{ date: string; amount: number }> {
    const series: Array<{ date: string; amount: number }> = [];
    const start = this.startOfUtcDay(now);

    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const day = new Date(start.getTime() - offset * 24 * 60 * 60 * 1000);
      const key = this.toUtcDayKey(day);
      series.push({ amount: byDay.get(key) ?? 0, date: key });
    }

    return series;
  }

  private buildWeeklySeries(
    byDay: Map<string, number>,
    now: Date,
    weeks: number,
  ): Array<{ date: string; amount: number }> {
    const series: Array<{ date: string; amount: number }> = [];
    const end = this.startOfUtcDay(now);
    // Align week start to Monday UTC.
    const endDay = end.getUTCDay();
    const daysSinceMonday = (endDay + 6) % 7;
    const currentWeekStart = new Date(
      end.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000,
    );

    for (let offset = weeks - 1; offset >= 0; offset -= 1) {
      const weekStart = new Date(
        currentWeekStart.getTime() - offset * 7 * 24 * 60 * 60 * 1000,
      );
      let amount = 0;
      for (let day = 0; day < 7; day += 1) {
        const key = this.toUtcDayKey(
          new Date(weekStart.getTime() + day * 24 * 60 * 60 * 1000),
        );
        amount += byDay.get(key) ?? 0;
      }
      series.push({ amount, date: this.toUtcDayKey(weekStart) });
    }

    return series;
  }

  private buildMonthlySeries(
    byDay: Map<string, number>,
    now: Date,
    months: number,
  ): Array<{ date: string; amount: number }> {
    const series: Array<{ date: string; amount: number }> = [];
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const cursor = new Date(Date.UTC(year, month - offset, 1));
      const keyPrefix = cursor.toISOString().slice(0, 7); // YYYY-MM
      let amount = 0;
      for (const [dayKey, dayAmount] of byDay.entries()) {
        if (dayKey.startsWith(keyPrefix)) {
          amount += dayAmount;
        }
      }
      series.push({ amount, date: `${keyPrefix}-01` });
    }

    return series;
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
      const currentBalance = this.readBalanceValue(balance);

      const latestAddDoc = await this.delegate.findFirst({
        orderBy: { createdAt: 'desc' },
        select: {
          amount: true,
          createdAt: true,
        },
        where: {
          category: CreditTransactionCategory.ADD,
          isDeleted: false,
          organizationId,
        },
      });
      const latestAdd = latestAddDoc
        ? this.normalizeDocument(latestAddDoc)
        : null;

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
