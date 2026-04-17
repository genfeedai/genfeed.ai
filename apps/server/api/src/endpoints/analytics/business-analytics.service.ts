import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

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
    private readonly prisma: PrismaService,
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

    const addSource = CreditTransactionCategory.ADD;

    const [
      todayResult,
      last7dResult,
      last30dResult,
      mtdResult,
      dailySeries,
      thisWeekTotal,
      lastWeekTotal,
    ] = await Promise.all([
      this.sumCreditTransactions(addSource, todayStart),
      this.sumCreditTransactions(addSource, last7dStart),
      this.sumCreditTransactions(addSource, last30dStart),
      this.sumCreditTransactions(addSource, mtdStart),
      this.getDailyCreditSeries(addSource, last30dStart, now),
      this.sumCreditTransactions(addSource, thisWeekStart),
      this.sumCreditTransactions(addSource, lastWeekStart, thisWeekStart),
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

    const addSource = CreditTransactionCategory.ADD;
    const deductSource = CreditTransactionCategory.DEDUCT;

    const [
      sold,
      consumed,
      dailySoldSeries,
      dailyConsumedSeries,
      thisWeekConsumed,
      lastWeekConsumed,
    ] = await Promise.all([
      this.sumCreditTransactions(addSource, last30dStart),
      this.sumCreditTransactions(deductSource, last30dStart),
      this.getDailyCreditSeries(addSource, last30dStart, now),
      this.getDailyCreditSeries(deductSource, last30dStart, now),
      this.sumCreditTransactions(deductSource, thisWeekStart),
      this.sumCreditTransactions(deductSource, lastWeekStart, thisWeekStart),
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

    const [
      todayResult,
      last7dResult,
      last30dResult,
      dailySeries,
      categoryBreakdown,
      thisWeekTotal,
      lastWeekTotal,
    ] = await Promise.all([
      this.countIngredients(todayStart),
      this.countIngredients(last7dStart),
      this.countIngredients(last30dStart),
      this.getDailyIngredientSeries(last30dStart, now),
      this.getIngredientCategoryBreakdown(last30dStart, now),
      this.countIngredients(thisWeekStart),
      this.countIngredients(lastWeekStart, thisWeekStart),
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
    source: string,
    createdAtGte?: Date,
    createdAtLt?: Date,
  ): Promise<number> {
    const transactions = await this.prisma.creditTransaction.findMany({
      select: { amount: true },
      where: {
        isDeleted: false,
        source,
        ...(createdAtGte || createdAtLt
          ? {
              createdAt: {
                ...(createdAtGte ? { gte: createdAtGte } : {}),
                ...(createdAtLt ? { lt: createdAtLt } : {}),
              },
            }
          : {}),
      },
    });
    return transactions.reduce((sum, t) => sum + (t.amount ?? 0), 0);
  }

  private async getDailyCreditSeries(
    source: string,
    from: Date,
    to: Date,
  ): Promise<DailyAmountEntry[]> {
    const transactions = await this.prisma.creditTransaction.findMany({
      select: { amount: true, createdAt: true },
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
        source,
      },
    });

    const byDay = new Map<string, number>();
    for (const t of transactions) {
      const day = t.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (t.amount ?? 0));
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ amount, date }));
  }

  private async countIngredients(
    createdAtGte?: Date,
    createdAtLt?: Date,
  ): Promise<number> {
    return this.prisma.ingredient.count({
      where: {
        isDeleted: false,
        ...(createdAtGte || createdAtLt
          ? {
              createdAt: {
                ...(createdAtGte ? { gte: createdAtGte } : {}),
                ...(createdAtLt ? { lt: createdAtLt } : {}),
              },
            }
          : {}),
      },
    });
  }

  private async getDailyIngredientSeries(
    from: Date,
    to: Date,
  ): Promise<DailyCountEntry[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      select: { createdAt: true },
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
      },
    });

    const byDay = new Map<string, number>();
    for (const i of ingredients) {
      const day = i.createdAt.toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ count, date }));
  }

  private async getIngredientCategoryBreakdown(
    from: Date,
    to: Date,
  ): Promise<CategoryBreakdownEntry[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      select: { category: true },
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
      },
    });

    const byCat = new Map<string, number>();
    for (const i of ingredients) {
      const cat = String(i.category ?? 'UNKNOWN');
      byCat.set(cat, (byCat.get(cat) ?? 0) + 1);
    }

    return Array.from(byCat.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([category, count]) => ({ category, count }));
  }

  private async getLeadersByCredits(
    source: string,
    from: Date,
    to: Date,
  ): Promise<LeaderEntry[]> {
    const transactions = await this.prisma.creditTransaction.findMany({
      select: { amount: true, organizationId: true },
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
        source,
      },
    });

    // Aggregate in-memory by organizationId
    const byOrg = new Map<string, number>();
    for (const t of transactions) {
      byOrg.set(
        t.organizationId,
        (byOrg.get(t.organizationId) ?? 0) + (t.amount ?? 0),
      );
    }

    const top10 = Array.from(byOrg.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (top10.length === 0) return [];

    // Resolve org names
    const orgIds = top10.map(([id]) => id);
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, label: true },
      where: { id: { in: orgIds }, isDeleted: false },
    });
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.label ?? 'Unknown']));

    return top10.map(([organizationId, amount]) => ({
      amount,
      organizationId,
      organizationName: orgNameMap.get(organizationId) ?? 'Unknown',
    }));
  }

  private async getLeadersByIngredients(
    from: Date,
    to: Date,
  ): Promise<LeaderCountEntry[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      select: { organizationId: true },
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
        organizationId: { not: null },
      },
    });

    // Aggregate in-memory by organizationId
    const byOrg = new Map<string, number>();
    for (const i of ingredients) {
      if (!i.organizationId) continue;
      byOrg.set(i.organizationId, (byOrg.get(i.organizationId) ?? 0) + 1);
    }

    const top10 = Array.from(byOrg.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    if (top10.length === 0) return [];

    // Resolve organization names
    const orgIds = top10.map(([id]) => id);
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, label: true },
      where: { id: { in: orgIds }, isDeleted: false },
    });
    const orgNameMap = new Map(orgs.map((o) => [o.id, o.label ?? 'Unknown']));

    return top10.map(([organizationId, count]) => ({
      count,
      organizationId,
      organizationName: orgNameMap.get(organizationId) ?? 'Unknown',
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
