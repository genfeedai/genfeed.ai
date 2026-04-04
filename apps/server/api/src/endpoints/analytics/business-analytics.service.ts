import {
  CreditTransactions,
  type CreditTransactionsDocument,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import {
  Ingredient,
  type IngredientDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import {
  Organization,
  type OrganizationDocument,
} from '@api/collections/organizations/schemas/organization.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type PipelineStage } from 'mongoose';

interface DailyAmountEntry {
  date: string;
  amount: number;
}

interface DailyCountEntry {
  date: string;
  count: number;
}

interface CategoryBreakdownEntry {
  category: string;
  count: number;
}

interface LeaderEntry {
  organizationId: string;
  organizationName: string;
  amount: number;
}

interface LeaderCountEntry {
  organizationId: string;
  organizationName: string;
  count: number;
}

interface BusinessAnalyticsResponse {
  revenue: {
    today: number;
    last7d: number;
    last30d: number;
    mtd: number;
    dailySeries: DailyAmountEntry[];
    wowGrowth: number;
  };
  credits: {
    sold: number;
    consumed: number;
    dailySoldSeries: DailyAmountEntry[];
    dailyConsumedSeries: DailyAmountEntry[];
    wowGrowth: number;
  };
  ingredients: {
    today: number;
    last7d: number;
    last30d: number;
    dailySeries: DailyCountEntry[];
    categoryBreakdown: CategoryBreakdownEntry[];
    wowGrowth: number;
  };
  leaders: {
    byRevenue: LeaderEntry[];
    byCredits: LeaderEntry[];
    byIngredients: LeaderCountEntry[];
  };
  projections: {
    revenueNext30d: number | null;
    creditsNext30d: number | null;
    ingredientsNext30d: number | null;
    isEstimate: boolean;
    insufficientData: boolean;
  };
  comparisons: {
    cashInVsUsageValue: { cashIn: number; usageValue: number };
    soldVsConsumed: { sold: number; consumed: number };
    outstandingPrepaid: number;
  };
}

@Injectable()
export class BusinessAnalyticsService {
  constructor(
    @InjectModel(CreditTransactions.name, DB_CONNECTIONS.AUTH)
    private readonly creditTransactionModel: Model<CreditTransactionsDocument>,
    @InjectModel(Ingredient.name, DB_CONNECTIONS.CLOUD)
    private readonly ingredientModel: Model<IngredientDocument>,
    @InjectModel(Organization.name, DB_CONNECTIONS.AUTH)
    private readonly organizationModel: Model<OrganizationDocument>,
    private readonly loggerService: LoggerService,
  ) {}

  @LogMethod()
  async getBusinessAnalytics(): Promise<BusinessAnalyticsResponse> {
    const now = new Date();

    const [revenue, credits, ingredients, leaders] = await Promise.all([
      this.getRevenueData(now),
      this.getCreditsData(now),
      this.getIngredientsData(now),
      this.getLeadersData(now),
    ]);

    const projections = this.computeProjections(
      revenue.dailySeries,
      credits.dailySoldSeries,
      ingredients.dailySeries,
    );

    const comparisons = {
      cashInVsUsageValue: {
        cashIn: credits.sold,
        usageValue: credits.consumed,
      },
      outstandingPrepaid: Math.max(0, credits.sold - credits.consumed),
      soldVsConsumed: {
        consumed: credits.consumed,
        sold: credits.sold,
      },
    };

    return {
      comparisons,
      credits,
      ingredients,
      leaders,
      projections,
      revenue,
    };
  }

  private async getRevenueData(now: Date) {
    const todayStart = startOfDay(now);
    const last7dStart = daysAgo(now, 7);
    const last30dStart = daysAgo(now, 30);
    const mtdStart = startOfMonth(now);
    const thisWeekStart = daysAgo(now, 7);
    const lastWeekStart = daysAgo(now, 14);

    const addMatch: PipelineStage.Match['$match'] = {
      category: CreditTransactionCategory.ADD,
      isDeleted: false,
    };

    const [
      todayResult,
      last7dResult,
      last30dResult,
      mtdResult,
      dailySeries,
      thisWeekTotal,
      lastWeekTotal,
    ] = await Promise.all([
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: todayStart },
      }),
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: last7dStart },
      }),
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: last30dStart },
      }),
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: mtdStart },
      }),
      this.getDailyCreditSeries(addMatch, last30dStart, now),
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: thisWeekStart },
      }),
      this.sumCreditTransactions({
        ...addMatch,
        createdAt: { $gte: lastWeekStart, $lt: thisWeekStart },
      }),
    ]);

    const wowGrowth = computeWowGrowth(thisWeekTotal, lastWeekTotal);

    return {
      dailySeries,
      last7d: last7dResult,
      last30d: last30dResult,
      mtd: mtdResult,
      today: todayResult,
      wowGrowth,
    };
  }

  private async getCreditsData(now: Date) {
    const last30dStart = daysAgo(now, 30);
    const thisWeekStart = daysAgo(now, 7);
    const lastWeekStart = daysAgo(now, 14);

    const addMatch: PipelineStage.Match['$match'] = {
      category: CreditTransactionCategory.ADD,
      createdAt: { $gte: last30dStart },
      isDeleted: false,
    };

    const deductMatch: PipelineStage.Match['$match'] = {
      category: CreditTransactionCategory.DEDUCT,
      createdAt: { $gte: last30dStart },
      isDeleted: false,
    };

    const [
      sold,
      consumed,
      dailySoldSeries,
      dailyConsumedSeries,
      thisWeekConsumed,
      lastWeekConsumed,
    ] = await Promise.all([
      this.sumCreditTransactions(addMatch),
      this.sumCreditTransactions(deductMatch),
      this.getDailyCreditSeries(
        { category: CreditTransactionCategory.ADD, isDeleted: false },
        last30dStart,
        now,
      ),
      this.getDailyCreditSeries(
        { category: CreditTransactionCategory.DEDUCT, isDeleted: false },
        last30dStart,
        now,
      ),
      this.sumCreditTransactions({
        category: CreditTransactionCategory.DEDUCT,
        createdAt: { $gte: thisWeekStart },
        isDeleted: false,
      }),
      this.sumCreditTransactions({
        category: CreditTransactionCategory.DEDUCT,
        createdAt: { $gte: lastWeekStart, $lt: thisWeekStart },
        isDeleted: false,
      }),
    ]);

    const wowGrowth = computeWowGrowth(thisWeekConsumed, lastWeekConsumed);

    return {
      consumed,
      dailyConsumedSeries,
      dailySoldSeries,
      sold,
      wowGrowth,
    };
  }

  private async getIngredientsData(now: Date) {
    const todayStart = startOfDay(now);
    const last7dStart = daysAgo(now, 7);
    const last30dStart = daysAgo(now, 30);
    const thisWeekStart = daysAgo(now, 7);
    const lastWeekStart = daysAgo(now, 14);

    const baseMatch: PipelineStage.Match['$match'] = {
      isDeleted: false,
    };

    const [
      todayResult,
      last7dResult,
      last30dResult,
      dailySeries,
      categoryBreakdown,
      thisWeekTotal,
      lastWeekTotal,
    ] = await Promise.all([
      this.countIngredients({
        ...baseMatch,
        createdAt: { $gte: todayStart },
      }),
      this.countIngredients({
        ...baseMatch,
        createdAt: { $gte: last7dStart },
      }),
      this.countIngredients({
        ...baseMatch,
        createdAt: { $gte: last30dStart },
      }),
      this.getDailyIngredientSeries(baseMatch, last30dStart, now),
      this.getIngredientCategoryBreakdown(baseMatch, last30dStart, now),
      this.countIngredients({
        ...baseMatch,
        createdAt: { $gte: thisWeekStart },
      }),
      this.countIngredients({
        ...baseMatch,
        createdAt: { $gte: lastWeekStart, $lt: thisWeekStart },
      }),
    ]);

    const wowGrowth = computeWowGrowth(thisWeekTotal, lastWeekTotal);

    return {
      categoryBreakdown,
      dailySeries,
      last7d: last7dResult,
      last30d: last30dResult,
      today: todayResult,
      wowGrowth,
    };
  }

  private async getLeadersData(now: Date) {
    const last30dStart = daysAgo(now, 30);

    const [byRevenue, byCredits, byIngredients] = await Promise.all([
      this.getLeadersByCredits(
        CreditTransactionCategory.ADD,
        last30dStart,
        now,
      ),
      this.getLeadersByCredits(
        CreditTransactionCategory.DEDUCT,
        last30dStart,
        now,
      ),
      this.getLeadersByIngredients(last30dStart, now),
    ]);

    return { byCredits, byIngredients, byRevenue };
  }

  private async sumCreditTransactions(
    match: PipelineStage.Match['$match'],
  ): Promise<number> {
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ];

    const result = await this.creditTransactionModel.aggregate(pipeline).exec();
    return result[0]?.total ?? 0;
  }

  private async getDailyCreditSeries(
    baseMatch: PipelineStage.Match['$match'],
    from: Date,
    to: Date,
  ): Promise<DailyAmountEntry[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { date: '$createdAt', format: '%Y-%m-%d' },
          },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          amount: 1,
          date: '$_id',
        },
      },
    ];

    return this.creditTransactionModel.aggregate(pipeline).exec();
  }

  private async countIngredients(
    match: PipelineStage.Match['$match'],
  ): Promise<number> {
    const pipeline: PipelineStage[] = [{ $match: match }, { $count: 'total' }];

    const result = await this.ingredientModel.aggregate(pipeline).exec();
    return result[0]?.total ?? 0;
  }

  private async getDailyIngredientSeries(
    baseMatch: PipelineStage.Match['$match'],
    from: Date,
    to: Date,
  ): Promise<DailyCountEntry[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: from, $lte: to },
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
      {
        $project: {
          _id: 0,
          count: 1,
          date: '$_id',
        },
      },
    ];

    return this.ingredientModel.aggregate(pipeline).exec();
  }

  private async getIngredientCategoryBreakdown(
    baseMatch: PipelineStage.Match['$match'],
    from: Date,
    to: Date,
  ): Promise<CategoryBreakdownEntry[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          ...baseMatch,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          category: '$_id',
          count: 1,
        },
      },
    ];

    return this.ingredientModel.aggregate(pipeline).exec();
  }

  private async getLeadersByCredits(
    category: CreditTransactionCategory,
    from: Date,
    to: Date,
  ): Promise<LeaderEntry[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          category,
          createdAt: { $gte: from, $lte: to },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$organization',
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { amount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          as: 'org',
          foreignField: '_id',
          from: 'organizations',
          localField: '_id',
        },
      },
      { $unwind: { path: '$org', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          amount: 1,
          organizationId: { $toString: '$_id' },
          organizationName: { $ifNull: ['$org.label', 'Unknown'] },
        },
      },
    ];

    return this.creditTransactionModel.aggregate(pipeline).exec();
  }

  private async getLeadersByIngredients(
    from: Date,
    to: Date,
  ): Promise<LeaderCountEntry[]> {
    // Ingredients are on CLOUD db, organizations on AUTH db.
    // $lookup cannot cross databases, so we aggregate first then resolve org names.
    const pipeline: PipelineStage[] = [
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: '$organization',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ];

    const results: Array<{ _id: string; count: number }> =
      await this.ingredientModel.aggregate(pipeline).exec();

    if (results.length === 0) {
      return [];
    }

    // Resolve organization names from AUTH connection
    const orgIds = results.map((r) => r._id);
    const orgs = await this.organizationModel
      .find({ _id: { $in: orgIds }, isDeleted: false })
      .select('_id label')
      .lean()
      .exec();

    const orgNameMap = new Map(
      orgs.map((o) => [o._id.toString(), o.label ?? 'Unknown']),
    );

    return results.map((r) => ({
      count: r.count,
      organizationId: r._id.toString(),
      organizationName: orgNameMap.get(r._id.toString()) ?? 'Unknown',
    }));
  }

  private computeProjections(
    revenueSeries: DailyAmountEntry[],
    creditsSoldSeries: DailyAmountEntry[],
    ingredientsSeries: DailyCountEntry[],
  ) {
    const minWeeks = 2;
    const hasEnoughRevenueData = revenueSeries.length >= minWeeks * 7;
    const hasEnoughCreditsData = creditsSoldSeries.length >= minWeeks * 7;
    const hasEnoughIngredientsData = ingredientsSeries.length >= minWeeks * 7;

    const insufficientData =
      !hasEnoughRevenueData &&
      !hasEnoughCreditsData &&
      !hasEnoughIngredientsData;

    return {
      creditsNext30d: hasEnoughCreditsData
        ? projectLinear30d(creditsSoldSeries.map((e) => e.amount))
        : null,
      ingredientsNext30d: hasEnoughIngredientsData
        ? projectLinear30d(ingredientsSeries.map((e) => e.count))
        : null,
      insufficientData,
      isEstimate: true,
      revenueNext30d: hasEnoughRevenueData
        ? projectLinear30d(revenueSeries.map((e) => e.amount))
        : null,
    };
  }
}

// --- Helper functions ---

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeWowGrowth(thisWeek: number, lastWeek: number): number {
  if (lastWeek === 0) {
    return thisWeek > 0 ? 100 : 0;
  }
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100 * 100) / 100;
}

function projectLinear30d(dailyValues: number[]): number {
  if (dailyValues.length < 7) {
    return 0;
  }

  // Compute weekly totals from the last 4 weeks
  const weeklyTotals: number[] = [];
  const totalDays = dailyValues.length;
  const weeksToUse = Math.min(4, Math.floor(totalDays / 7));

  for (let w = 0; w < weeksToUse; w++) {
    const weekStart = totalDays - (w + 1) * 7;
    const weekEnd = totalDays - w * 7;
    const weekSlice = dailyValues.slice(
      Math.max(0, weekStart),
      Math.max(0, weekEnd),
    );
    const weekTotal = weekSlice.reduce((sum, val) => sum + val, 0);
    weeklyTotals.unshift(weekTotal);
  }

  if (weeklyTotals.length < 2) {
    // Extrapolate from single week
    return Math.round((weeklyTotals[0] / 7) * 30);
  }

  // Simple linear regression on weekly totals
  const n = weeklyTotals.length;
  const xMean = (n - 1) / 2;
  const yMean = weeklyTotals.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (weeklyTotals[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  // Project next ~4.3 weeks (30 days)
  let projected = 0;
  for (let w = 0; w < 5; w++) {
    const weekIndex = n + w;
    const weekValue = Math.max(0, intercept + slope * weekIndex);
    projected += weekValue;
  }

  // Adjust for 30 days (5 weeks = 35 days, scale to 30)
  projected = (projected / 35) * 30;

  return Math.round(projected);
}
