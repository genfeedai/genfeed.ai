import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditTransactionCategory,
  IngredientCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type StripeCharge = {
  amount: number;
  created: number;
  id: string;
  metadata?: Record<string, string>;
  paid: boolean;
  refunded: boolean;
};

type StripeChargeListParams = {
  created: {
    gte: number;
    lte: number;
  };
  limit: number;
  starting_after?: string;
};

interface DailyRevenueSeries {
  date: string;
  revenue: number;
  count: number;
}

interface RevenueSummary {
  revenueToday: number;
  revenue7d: number;
  revenue30d: number;
  revenueMtd: number;
  creditsSoldTotal: number;
  dailySeries: DailyRevenueSeries[];
  wowGrowth: number;
}

interface DailyCreditSeries {
  date: string;
  creditsConsumed: number;
  count: number;
}

interface CreditSourceBreakdown {
  source: string;
  amount: number;
  count: number;
}

interface OrgCreditLeaderboard {
  organizationId: string;
  creditsConsumed: number;
  transactionCount: number;
}

interface CreditConsumptionSummary {
  totalConsumed30d: number;
  totalConsumed7d: number;
  dailySeries: DailyCreditSeries[];
  bySource: CreditSourceBreakdown[];
  topOrganizations: OrgCreditLeaderboard[];
  wowGrowth: number;
}

interface DailyIngredientSeries {
  date: string;
  count: number;
}

interface IngredientCategoryBreakdown {
  category: string;
  count: number;
}

interface OrgIngredientLeaderboard {
  organizationId: string;
  ingredientCount: number;
}

interface IngredientSummary {
  total30d: number;
  total7d: number;
  dailySeries: DailyIngredientSeries[];
  byCategory: IngredientCategoryBreakdown[];
  topOrganizations: OrgIngredientLeaderboard[];
  wowGrowth: number;
}

export interface BusinessAnalyticsData {
  revenue: RevenueSummary;
  credits: CreditConsumptionSummary;
  ingredients: IngredientSummary;
}

@Injectable()
export class BusinessAnalyticsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly loggerService: LoggerService,
  ) {}

  async getBusinessAnalytics(): Promise<BusinessAnalyticsData> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    const [revenue, credits, ingredients] = await Promise.all([
      this.getRevenueSummary(),
      this.getCreditConsumptionSummary(),
      this.getIngredientSummary(),
    ]);

    return { credits, ingredients, revenue };
  }

  private async getRevenueSummary(): Promise<RevenueSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(
        now.getTime() - 14 * 24 * 60 * 60 * 1000,
      );

      const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Query Stripe for successful charges in last 30 days
      const charges = await this.fetchStripeCharges(thirtyDaysAgo, now);

      let revenueToday = 0;
      let revenue7d = 0;
      let revenue30d = 0;
      let revenueMtd = 0;
      let creditsSoldTotal = 0;
      let revenueWeek1 = 0; // 14d-7d ago
      let revenueWeek2 = 0; // 7d-now

      const dailyMap = new Map<string, { revenue: number; count: number }>();

      for (const charge of charges) {
        const chargeDate = new Date(charge.created * 1000);
        const dateKey = chargeDate.toISOString().split('T')[0];
        const amountInDollars = charge.amount / 100;

        revenue30d += amountInDollars;

        if (chargeDate >= todayStart) {
          revenueToday += amountInDollars;
        }
        if (chargeDate >= sevenDaysAgo) {
          revenue7d += amountInDollars;
          revenueWeek2 += amountInDollars;
        }
        if (chargeDate >= fourteenDaysAgo && chargeDate < sevenDaysAgo) {
          revenueWeek1 += amountInDollars;
        }
        if (chargeDate >= mtdStart) {
          revenueMtd += amountInDollars;
        }

        // Track credits sold via metadata
        const creditsMeta = charge.metadata?.credits;
        if (creditsMeta) {
          creditsSoldTotal += Number(creditsMeta) || 0;
        }

        const existing = dailyMap.get(dateKey) || { count: 0, revenue: 0 };
        existing.revenue += amountInDollars;
        existing.count += 1;
        dailyMap.set(dateKey, existing);
      }

      // Build daily series for last 30 days
      const dailySeries: DailyRevenueSeries[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        const entry = dailyMap.get(key) || { count: 0, revenue: 0 };
        dailySeries.push({
          count: entry.count,
          date: key,
          revenue: Math.round(entry.revenue * 100) / 100,
        });
      }

      // WoW growth: compare this week to last week
      const wowGrowth =
        revenueWeek1 > 0
          ? Math.round(
              ((revenueWeek2 - revenueWeek1) / revenueWeek1) * 100 * 100,
            ) / 100
          : 0;

      return {
        creditsSoldTotal,
        dailySeries,
        revenue7d: Math.round(revenue7d * 100) / 100,
        revenue30d: Math.round(revenue30d * 100) / 100,
        revenueMtd: Math.round(revenueMtd * 100) / 100,
        revenueToday: Math.round(revenueToday * 100) / 100,
        wowGrowth,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} getRevenueSummary failed`, error);
      return {
        creditsSoldTotal: 0,
        dailySeries: [],
        revenue7d: 0,
        revenue30d: 0,
        revenueMtd: 0,
        revenueToday: 0,
        wowGrowth: 0,
      };
    }
  }

  private async fetchStripeCharges(
    startDate: Date,
    endDate: Date,
  ): Promise<StripeCharge[]> {
    const charges: StripeCharge[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: StripeChargeListParams = {
        created: {
          gte: Math.floor(startDate.getTime() / 1000),
          lte: Math.floor(endDate.getTime() / 1000),
        },
        limit: 100,
        // Only count paid charges (successful payments)
      };

      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const response = await this.stripeService.stripe.charges.list(
        params as never,
      );

      // Filter to only paid charges
      const paidCharges = response.data.filter((c) => c.paid && !c.refunded);
      charges.push(...paidCharges);

      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    return charges;
  }

  private async getCreditConsumptionSummary(): Promise<CreditConsumptionSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(
        now.getTime() - 14 * 24 * 60 * 60 * 1000,
      );

      // Fetch all deduct transactions in last 30 days and aggregate in memory
      const allTransactions = await this.prisma.creditTransaction.findMany({
        where: {
          category: CreditTransactionCategory.DEDUCT,
          createdAt: { gte: thirtyDaysAgo },
          isDeleted: false,
        },
      });

      let total7d = 0;
      let total30d = 0;
      let totalWeek1 = 0;
      const dailyMap = new Map<
        string,
        { creditsConsumed: number; count: number }
      >();
      const sourceMap = new Map<string, { amount: number; count: number }>();
      const orgMap = new Map<
        string,
        { creditsConsumed: number; transactionCount: number }
      >();

      for (const tx of allTransactions) {
        const absAmount = Math.abs(tx.amount ?? 0);
        const dateKey = tx.createdAt.toISOString().split('T')[0];
        total30d += absAmount;
        if (tx.createdAt >= sevenDaysAgo) {
          total7d += absAmount;
        }
        if (tx.createdAt >= fourteenDaysAgo && tx.createdAt < sevenDaysAgo) {
          totalWeek1 += absAmount;
        }

        const dailyEntry = dailyMap.get(dateKey) ?? {
          count: 0,
          creditsConsumed: 0,
        };
        dailyEntry.creditsConsumed += absAmount;
        dailyEntry.count += 1;
        dailyMap.set(dateKey, dailyEntry);

        const source = (tx.source as string) ?? 'unknown';
        const srcEntry = sourceMap.get(source) ?? { amount: 0, count: 0 };
        srcEntry.amount += absAmount;
        srcEntry.count += 1;
        sourceMap.set(source, srcEntry);

        const orgId = tx.organizationId ?? '';
        if (orgId) {
          const orgEntry = orgMap.get(orgId) ?? {
            creditsConsumed: 0,
            transactionCount: 0,
          };
          orgEntry.creditsConsumed += absAmount;
          orgEntry.transactionCount += 1;
          orgMap.set(orgId, orgEntry);
        }
      }

      const totalData = { total7d, total30d, totalWeek1 };

      const dailySeries: DailyCreditSeries[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        const entry = dailyMap.get(key) ?? { count: 0, creditsConsumed: 0 };
        dailySeries.push({ date: key, ...entry });
      }

      // By source
      const bySource = Array.from(sourceMap.entries())
        .map(([source, data]) => ({ ...data, source }))
        .sort((a, b) => b.amount - a.amount);

      // Top organizations by credit consumption
      const topOrganizations = Array.from(orgMap.entries())
        .map(([organizationId, data]) => ({ ...data, organizationId }))
        .sort((a, b) => b.creditsConsumed - a.creditsConsumed)
        .slice(0, 10);

      // WoW growth
      const wowGrowth =
        totalData.totalWeek1 > 0
          ? Math.round(
              ((totalData.total7d - totalData.totalWeek1) /
                totalData.totalWeek1) *
                100 *
                100,
            ) / 100
          : 0;

      return {
        bySource,
        dailySeries,
        topOrganizations,
        totalConsumed7d: totalData.total7d,
        totalConsumed30d: totalData.total30d,
        wowGrowth,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} getCreditConsumptionSummary failed`,
        error,
      );
      return {
        bySource: [],
        dailySeries: [],
        topOrganizations: [],
        totalConsumed7d: 0,
        totalConsumed30d: 0,
        wowGrowth: 0,
      };
    }
  }

  private async getIngredientSummary(): Promise<IngredientSummary> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(
        now.getTime() - 14 * 24 * 60 * 60 * 1000,
      );

      const supportedCategories = [
        IngredientCategory.IMAGE,
        IngredientCategory.VIDEO,
        IngredientCategory.MUSIC,
        IngredientCategory.VOICE,
        IngredientCategory.AVATAR,
      ];

      // Fetch all matching ingredients in last 30 days and aggregate in memory
      const allIngredients = await this.prisma.ingredient.findMany({
        where: {
          category: { in: supportedCategories as never },
          createdAt: { gte: thirtyDaysAgo },
          isDeleted: false,
        },
      });

      let ingredientTotal7d = 0;
      let ingredientTotal30d = 0;
      let ingredientTotalWeek1 = 0;
      const ingredientDailyMap = new Map<string, number>();
      const categoryMap = new Map<string, number>();
      const ingredientOrgMap = new Map<string, number>();

      for (const ingredient of allIngredients) {
        const dateKey = ingredient.createdAt.toISOString().split('T')[0];
        ingredientTotal30d += 1;
        if (ingredient.createdAt >= sevenDaysAgo) {
          ingredientTotal7d += 1;
        }
        if (
          ingredient.createdAt >= fourteenDaysAgo &&
          ingredient.createdAt < sevenDaysAgo
        ) {
          ingredientTotalWeek1 += 1;
        }

        ingredientDailyMap.set(
          dateKey,
          (ingredientDailyMap.get(dateKey) ?? 0) + 1,
        );

        const cat = ingredient.category ?? 'unknown';
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);

        const orgId = ingredient.organizationId ?? '';
        if (orgId) {
          ingredientOrgMap.set(orgId, (ingredientOrgMap.get(orgId) ?? 0) + 1);
        }
      }

      const totalData = {
        total30d: ingredientTotal30d,
        total7d: ingredientTotal7d,
        totalWeek1: ingredientTotalWeek1,
      };

      const dailySeries: DailyIngredientSeries[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        dailySeries.push({
          count: ingredientDailyMap.get(key) ?? 0,
          date: key,
        });
      }

      // By category
      const byCategory = Array.from(categoryMap.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      // Top organizations by ingredient generation
      const topOrganizations = Array.from(ingredientOrgMap.entries())
        .map(([organizationId, ingredientCount]) => ({
          ingredientCount,
          organizationId,
        }))
        .sort((a, b) => b.ingredientCount - a.ingredientCount)
        .slice(0, 10);

      // WoW growth
      const wowGrowth =
        totalData.totalWeek1 > 0
          ? Math.round(
              ((totalData.total7d - totalData.totalWeek1) /
                totalData.totalWeek1) *
                100 *
                100,
            ) / 100
          : 0;

      return {
        byCategory,
        dailySeries,
        topOrganizations,
        total7d: totalData.total7d,
        total30d: totalData.total30d,
        wowGrowth,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} getIngredientSummary failed`, error);
      return {
        byCategory: [],
        dailySeries: [],
        topOrganizations: [],
        total7d: 0,
        total30d: 0,
        wowGrowth: 0,
      };
    }
  }
}
