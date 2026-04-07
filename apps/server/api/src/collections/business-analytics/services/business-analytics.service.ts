import {
  CreditTransactions,
  type CreditTransactionsDocument,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import {
  CreditTransactionCategory,
  IngredientCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type Stripe from 'stripe';

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
    @InjectModel(CreditTransactions.name, DB_CONNECTIONS.AUTH)
    private readonly creditTransactionsModel: AggregatePaginateModel<CreditTransactionsDocument>,
    @InjectModel(Ingredient.name, DB_CONNECTIONS.CLOUD)
    private readonly ingredientModel: AggregatePaginateModel<IngredientDocument>,
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
  ): Promise<Stripe.Charge[]> {
    const charges: Stripe.Charge[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.ChargeListParams = {
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

      const response = await this.stripeService.stripe.charges.list(params);

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

      // Aggregate total consumed in 30d and 7d
      const totals = await this.creditTransactionsModel.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            total7d: {
              $sum: {
                $cond: [
                  { $gte: ['$createdAt', sevenDaysAgo] },
                  { $abs: '$amount' },
                  0,
                ],
              },
            },
            total30d: { $sum: { $abs: '$amount' } },
            totalWeek1: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$createdAt', fourteenDaysAgo] },
                      { $lt: ['$createdAt', sevenDaysAgo] },
                    ],
                  },
                  { $abs: '$amount' },
                  0,
                ],
              },
            },
          },
        },
      ]);

      const totalData = totals[0] || { total7d: 0, total30d: 0, totalWeek1: 0 };

      // Daily series for last 30 days
      const dailyAgg = await this.creditTransactionsModel.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
            },
            count: { $sum: 1 },
            creditsConsumed: { $sum: { $abs: '$amount' } },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dailyMap = new Map<
        string,
        { creditsConsumed: number; count: number }
      >();
      for (const entry of dailyAgg) {
        dailyMap.set(entry._id, {
          count: entry.count,
          creditsConsumed: entry.creditsConsumed,
        });
      }

      const dailySeries: DailyCreditSeries[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        const entry = dailyMap.get(key) || { count: 0, creditsConsumed: 0 };
        dailySeries.push({ date: key, ...entry });
      }

      // By source
      const bySource = await this.creditTransactionsModel.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: { $ifNull: ['$source', 'unknown'] },
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
        { $sort: { amount: -1 } },
      ]);

      // Top organizations by credit consumption
      const topOrganizations = await this.creditTransactionsModel.aggregate([
        {
          $match: {
            category: CreditTransactionCategory.DEDUCT,
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$organization',
            creditsConsumed: { $sum: { $abs: '$amount' } },
            transactionCount: { $sum: 1 },
          },
        },
        { $sort: { creditsConsumed: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            creditsConsumed: 1,
            organizationId: { $toString: '$_id' },
            transactionCount: 1,
          },
        },
      ]);

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

      // Totals for 30d, 7d, and week-over-week
      const totals = await this.ingredientModel.aggregate([
        {
          $match: {
            category: { $in: supportedCategories },
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            total7d: {
              $sum: {
                $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, 1, 0],
              },
            },
            total30d: { $sum: 1 },
            totalWeek1: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ['$createdAt', fourteenDaysAgo] },
                      { $lt: ['$createdAt', sevenDaysAgo] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const totalData = totals[0] || { total7d: 0, total30d: 0, totalWeek1: 0 };

      // Daily series
      const dailyAgg = await this.ingredientModel.aggregate([
        {
          $match: {
            category: { $in: supportedCategories },
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      const dailyMap = new Map<string, number>();
      for (const entry of dailyAgg) {
        dailyMap.set(entry._id, entry.count);
      }

      const dailySeries: DailyIngredientSeries[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        dailySeries.push({ count: dailyMap.get(key) || 0, date: key });
      }

      // By category
      const byCategory = await this.ingredientModel.aggregate([
        {
          $match: {
            category: { $in: supportedCategories },
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            category: '$_id',
            count: 1,
          },
        },
        { $sort: { count: -1 } },
      ]);

      // Top organizations by ingredient generation
      const topOrganizations = await this.ingredientModel.aggregate([
        {
          $match: {
            category: { $in: supportedCategories },
            createdAt: { $gte: thirtyDaysAgo },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$organization',
            ingredientCount: { $sum: 1 },
          },
        },
        { $sort: { ingredientCount: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            ingredientCount: 1,
            organizationId: { $toString: '$_id' },
          },
        },
      ]);

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
