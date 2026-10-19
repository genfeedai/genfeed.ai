import {
  CREDIT_USAGE_AMOUNT_SQL,
  CREDIT_USAGE_FILTER_SQL,
} from '@api/collections/credits/services/credit-usage.util';
import {
  buildDailyPoints,
  buildEconomicsTotals,
  buildOperationCoverage,
  type EconomicsDailyAggregate,
  type EconomicsWindow,
  EMPTY_ECONOMICS_DAILY_AGGREGATE,
  enumerateWindowDays,
  formatUtcDay,
  microsToUsd,
  minorToUsd,
  type NumericSqlValue,
  resolveEconomicsWindow,
  sumDailyAggregates,
  toNumber,
} from '@api/endpoints/admin/economics/economics-report.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingRevenueSource } from '@genfeedai/contracts';
import type {
  EconomicsCostKind,
  IEconomicsCostCategoryRow,
  IEconomicsCostDailyPoint,
  IEconomicsCostModelRow,
  IEconomicsCostReport,
  IEconomicsCoverageReport,
  IEconomicsLedgerCoverage,
  IEconomicsOverviewReport,
  IEconomicsQuery,
  IEconomicsRevenueDailyPoint,
  IEconomicsRevenueEvent,
  IEconomicsRevenueOrganizationRow,
  IEconomicsRevenueReport,
  IEconomicsRevenueSourceRow,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

const REPORTING_CURRENCY = 'usd';
const LATEST_REVENUE_EVENTS_LIMIT = 50;
const TOP_REVENUE_ORGANIZATIONS = 10;
const COST_MODEL_ROW_LIMIT = 100;
/** Workflow-attributed ledger rows count once they are settled. */
const SETTLED_COST_EVIDENCE = ['observed', 'calculated', 'byok'];

interface DayRevenueRow {
  day: string;
  events: NumericSqlValue;
  revenueMinor: NumericSqlValue;
}

interface DayCostRow {
  calls: NumericSqlValue;
  costMicros: NumericSqlValue;
  day: string;
}

interface DayCreditRow {
  credits: NumericSqlValue;
  day: string;
}

interface OrganizationCountRow {
  isCurrent: boolean;
  organizations: NumericSqlValue;
}

interface RevenueSourceDayRow {
  day: string;
  revenueMinor: NumericSqlValue;
  source: string;
}

interface RevenueSourceRow {
  events: NumericSqlValue;
  revenueMinor: NumericSqlValue;
  source: string;
}

interface RevenueOrganizationRow {
  events: NumericSqlValue;
  organizationId: string;
  revenueMinor: NumericSqlValue;
}

interface RevenueEventRow {
  amountMinor: number;
  id: string;
  occurredAt: Date;
  organizationId: string;
  source: string;
  stripeObjectId: string;
}

interface RevenueLedgerRow {
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
  nonUsdEvents: NumericSqlValue;
  periodRows: NumericSqlValue;
}

interface CostModelRow {
  byokCalls: NumericSqlValue;
  calls: NumericSqlValue;
  completionTokens: NumericSqlValue;
  costMicros: NumericSqlValue;
  kind: EconomicsCostKind;
  model: string;
  promptTokens: NumericSqlValue;
  provider: string;
  unpricedCalls: NumericSqlValue;
}

interface CostFlagsRow {
  byokCalls: NumericSqlValue;
  unpricedCalls: NumericSqlValue;
}

interface MediaCategoryRow {
  category: string | null;
  costMicros: NumericSqlValue;
  generations: NumericSqlValue;
}

interface CostLedgerRow {
  byokRows: NumericSqlValue;
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
  pendingRows: NumericSqlValue;
  periodRows: NumericSqlValue;
  unpricedRows: NumericSqlValue;
}

interface CreditLedgerRow {
  firstRecordedAt: Date | null;
  lastRecordedAt: Date | null;
  periodRows: NumericSqlValue;
}

interface CreditSourceRow {
  credits: NumericSqlValue;
  source: string | null;
}

interface LlmSplitRow {
  chatCostMicros: NumericSqlValue;
  otherCostMicros: NumericSqlValue;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * Platform-admin economics reports. Cross-tenant on purpose (superadmin
 * only): every query is bounded by a whole-UTC-day window and
 * `isDeleted = false`, and aggregation runs in Postgres over the period
 * indexes added with the revenue ledger.
 */
@Injectable()
export class EconomicsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: IEconomicsQuery): Promise<IEconomicsOverviewReport> {
    const window = resolveEconomicsWindow(query);
    const span = { from: window.previousFrom, toExclusive: window.toExclusive };

    // tenant-scope-ignore: superadmin cross-organization reporting
    const [revenue, llm, media, credits, payingOrgs, activeOrgs] =
      await Promise.all([
        this.prisma.$queryRaw<DayRevenueRow[]>(this.revenueByDaySql(span)),
        this.prisma.$queryRaw<DayCostRow[]>(this.llmByDaySql(span)),
        this.prisma.$queryRaw<DayCostRow[]>(this.mediaByDaySql(span)),
        this.prisma.$queryRaw<DayCreditRow[]>(this.creditsByDaySql(span)),
        this.prisma.$queryRaw<OrganizationCountRow[]>(
          this.payingOrganizationsSql(window),
        ),
        this.prisma.$queryRaw<OrganizationCountRow[]>(
          this.activeOrganizationsSql(window),
        ),
      ]);

    const byDay = new Map<string, EconomicsDailyAggregate>();
    const dayFor = (day: string): EconomicsDailyAggregate => {
      const existing = byDay.get(day);
      if (existing) return existing;
      const created = { ...EMPTY_ECONOMICS_DAILY_AGGREGATE };
      byDay.set(day, created);
      return created;
    };
    for (const row of revenue) {
      const aggregate = dayFor(row.day);
      aggregate.revenueMinor += toNumber(row.revenueMinor);
      aggregate.revenueEvents += toNumber(row.events);
    }
    for (const row of llm) {
      const aggregate = dayFor(row.day);
      aggregate.llmCostMicros += toNumber(row.costMicros);
      aggregate.llmCalls += toNumber(row.calls);
    }
    for (const row of media) {
      const aggregate = dayFor(row.day);
      aggregate.mediaCostMicros += toNumber(row.costMicros);
      aggregate.mediaGenerations += toNumber(row.calls);
    }
    for (const row of credits) {
      dayFor(row.day).creditsConsumed += toNumber(row.credits);
    }

    const currentDays = enumerateWindowDays(window);
    const previousDays = enumerateWindowDays({
      ...window,
      from: window.previousFrom,
    });
    const countFor = (rows: OrganizationCountRow[], isCurrent: boolean) =>
      toNumber(rows.find((row) => row.isCurrent === isCurrent)?.organizations);
    const totalsFor = (days: string[], isCurrent: boolean) =>
      buildEconomicsTotals(
        sumDailyAggregates(
          days.map((day) => byDay.get(day) ?? EMPTY_ECONOMICS_DAILY_AGGREGATE),
        ),
        {
          active: countFor(activeOrgs, isCurrent),
          paying: countFor(payingOrgs, isCurrent),
        },
      );

    return {
      daily: buildDailyPoints(currentDays, byDay),
      from: formatUtcDay(window.from),
      previousFrom: formatUtcDay(window.previousFrom),
      previousTo: formatUtcDay(new Date(window.from.getTime() - 1)),
      previousTotals: totalsFor(previousDays, false),
      to: formatUtcDay(new Date(window.toExclusive.getTime() - 1)),
      totals: totalsFor(currentDays, true),
    };
  }

  async getRevenue(query: IEconomicsQuery): Promise<IEconomicsRevenueReport> {
    const window = resolveEconomicsWindow(query);
    const span = { from: window.from, toExclusive: window.toExclusive };

    // tenant-scope-ignore: superadmin cross-organization reporting
    const [byDay, bySource, topOrganizations, latest, ledger, payingOrgs] =
      await Promise.all([
        this.prisma.$queryRaw<RevenueSourceDayRow[]>(
          this.revenueBySourceByDaySql(span),
        ),
        this.prisma.$queryRaw<RevenueSourceRow[]>(
          this.revenueBySourceSql(span),
        ),
        this.prisma.$queryRaw<RevenueOrganizationRow[]>(
          this.revenueByOrganizationSql(span),
        ),
        this.prisma.$queryRaw<RevenueEventRow[]>(this.latestRevenueSql(span)),
        this.prisma.$queryRaw<RevenueLedgerRow[]>(this.revenueLedgerSql(span)),
        this.prisma.$queryRaw<OrganizationCountRow[]>(
          this.payingOrganizationsSql(window),
        ),
      ]);

    const labels = await this.readOrganizationLabels([
      ...topOrganizations.map((row) => row.organizationId),
      ...latest.map((row) => row.organizationId),
    ]);
    const labelOf = (id: string) => labels.get(id) ?? id;

    const dayRows = new Map<
      string,
      { creditPack: number; subscription: number }
    >();
    for (const row of byDay) {
      const entry = dayRows.get(row.day) ?? { creditPack: 0, subscription: 0 };
      const minor = toNumber(row.revenueMinor);
      if (row.source === BillingRevenueSource.SUBSCRIPTION_INVOICE) {
        entry.subscription += minor;
      } else {
        entry.creditPack += minor;
      }
      dayRows.set(row.day, entry);
    }
    const daily: IEconomicsRevenueDailyPoint[] = enumerateWindowDays(
      window,
    ).map((date) => {
      const entry = dayRows.get(date);
      return {
        creditPackUsd: minorToUsd(entry?.creditPack ?? 0),
        date,
        subscriptionUsd: minorToUsd(entry?.subscription ?? 0),
      };
    });

    const sources: IEconomicsRevenueSourceRow[] = bySource.map((row) => ({
      events: toNumber(row.events),
      revenueUsd: minorToUsd(toNumber(row.revenueMinor)),
      source: row.source,
    }));
    const events = sources.reduce((sum, row) => sum + row.events, 0);
    const revenueMinor = bySource.reduce(
      (sum, row) => sum + toNumber(row.revenueMinor),
      0,
    );

    return {
      daily,
      from: formatUtcDay(window.from),
      latestEvents: latest.map(
        (row): IEconomicsRevenueEvent => ({
          amountUsd: minorToUsd(row.amountMinor),
          id: row.id,
          occurredAt: row.occurredAt.toISOString(),
          organizationId: row.organizationId,
          organizationLabel: labelOf(row.organizationId),
          source: row.source,
          stripeObjectId: row.stripeObjectId,
        }),
      ),
      latestEventsLimit: LATEST_REVENUE_EVENTS_LIMIT,
      ledgerStartedAt: toIso(ledger[0]?.firstRecordedAt ?? null),
      nonUsdEvents: toNumber(ledger[0]?.nonUsdEvents),
      sources,
      to: formatUtcDay(new Date(window.toExclusive.getTime() - 1)),
      topOrganizations: topOrganizations.map(
        (row): IEconomicsRevenueOrganizationRow => ({
          events: toNumber(row.events),
          id: row.organizationId,
          label: labelOf(row.organizationId),
          revenueUsd: minorToUsd(toNumber(row.revenueMinor)),
        }),
      ),
      totals: {
        averageRevenuePerEventUsd:
          events > 0 ? minorToUsd(revenueMinor / events) : 0,
        events,
        payingOrganizations: toNumber(
          payingOrgs.find((row) => row.isCurrent)?.organizations,
        ),
        revenueUsd: minorToUsd(revenueMinor),
      },
    };
  }

  async getCosts(query: IEconomicsQuery): Promise<IEconomicsCostReport> {
    const window = resolveEconomicsWindow(query);
    const span = { from: window.from, toExclusive: window.toExclusive };

    // tenant-scope-ignore: superadmin cross-organization reporting
    const [llmByDay, mediaByDay, models, flags, categories] = await Promise.all(
      [
        this.prisma.$queryRaw<DayCostRow[]>(this.llmByDaySql(span)),
        this.prisma.$queryRaw<DayCostRow[]>(this.mediaByDaySql(span)),
        this.prisma.$queryRaw<CostModelRow[]>(this.costModelsSql(span)),
        this.prisma.$queryRaw<CostFlagsRow[]>(this.costFlagsSql(span)),
        this.prisma.$queryRaw<MediaCategoryRow[]>(this.mediaCategorySql(span)),
      ],
    );

    const byDay = new Map<string, EconomicsDailyAggregate>();
    for (const row of llmByDay) {
      const aggregate = byDay.get(row.day) ?? {
        ...EMPTY_ECONOMICS_DAILY_AGGREGATE,
      };
      aggregate.llmCostMicros += toNumber(row.costMicros);
      aggregate.llmCalls += toNumber(row.calls);
      byDay.set(row.day, aggregate);
    }
    for (const row of mediaByDay) {
      const aggregate = byDay.get(row.day) ?? {
        ...EMPTY_ECONOMICS_DAILY_AGGREGATE,
      };
      aggregate.mediaCostMicros += toNumber(row.costMicros);
      aggregate.mediaGenerations += toNumber(row.calls);
      byDay.set(row.day, aggregate);
    }
    const total = sumDailyAggregates(byDay.values());
    const llmCostUsd = microsToUsd(total.llmCostMicros);
    const mediaCostUsd = microsToUsd(total.mediaCostMicros);

    const daily: IEconomicsCostDailyPoint[] = enumerateWindowDays(window).map(
      (date) => {
        const aggregate = byDay.get(date) ?? EMPTY_ECONOMICS_DAILY_AGGREGATE;
        return {
          date,
          llmCostUsd: microsToUsd(aggregate.llmCostMicros),
          mediaCostUsd: microsToUsd(aggregate.mediaCostMicros),
        };
      },
    );

    return {
      daily,
      from: formatUtcDay(window.from),
      mediaCategories: categories.map(
        (row): IEconomicsCostCategoryRow => ({
          category: row.category ?? 'UNKNOWN',
          costUsd: microsToUsd(toNumber(row.costMicros)),
          generations: toNumber(row.generations),
        }),
      ),
      models: models.map((row): IEconomicsCostModelRow => {
        const calls = toNumber(row.calls);
        const costUsd = microsToUsd(toNumber(row.costMicros));
        return {
          averageCostUsd: calls > 0 ? Number((costUsd / calls).toFixed(6)) : 0,
          byokCalls: toNumber(row.byokCalls),
          calls,
          completionTokens: toNumber(row.completionTokens),
          costUsd,
          kind: row.kind,
          model: row.model,
          promptTokens: toNumber(row.promptTokens),
          provider: row.provider,
          unpricedCalls: toNumber(row.unpricedCalls),
        };
      }),
      to: formatUtcDay(new Date(window.toExclusive.getTime() - 1)),
      totals: {
        byokCalls: toNumber(flags[0]?.byokCalls),
        llmCalls: total.llmCalls,
        llmCostUsd,
        mediaCostUsd,
        mediaGenerations: total.mediaGenerations,
        providerCostUsd: Number((llmCostUsd + mediaCostUsd).toFixed(6)),
        unpricedCalls: toNumber(flags[0]?.unpricedCalls),
      },
    };
  }

  async getCoverage(query: IEconomicsQuery): Promise<IEconomicsCoverageReport> {
    const window = resolveEconomicsWindow(query);
    const span = { from: window.from, toExclusive: window.toExclusive };

    // tenant-scope-ignore: superadmin cross-organization reporting
    const [
      revenueLedger,
      llmLedger,
      mediaLedger,
      creditLedger,
      creditsBySource,
      llmSplit,
      mediaByCategory,
    ] = await Promise.all([
      this.prisma.$queryRaw<RevenueLedgerRow[]>(this.revenueLedgerSql(span)),
      this.prisma.$queryRaw<CostLedgerRow[]>(this.costLedgerSql('llm', span)),
      this.prisma.$queryRaw<CostLedgerRow[]>(this.costLedgerSql('media', span)),
      this.prisma.$queryRaw<CreditLedgerRow[]>(this.creditLedgerSql(span)),
      this.prisma.$queryRaw<CreditSourceRow[]>(this.creditsBySourceSql(span)),
      this.prisma.$queryRaw<LlmSplitRow[]>(this.llmSplitSql(span)),
      this.prisma.$queryRaw<MediaCategoryRow[]>(this.mediaCategorySql(span)),
    ]);

    const cost = (row: CostLedgerRow | undefined, key: 'llm' | 'media') =>
      ({
        byokRows: toNumber(row?.byokRows),
        firstRecordedAt: toIso(row?.firstRecordedAt ?? null),
        key,
        lastRecordedAt: toIso(row?.lastRecordedAt ?? null),
        pendingRows: toNumber(row?.pendingRows),
        periodRows: toNumber(row?.periodRows),
        unpricedRows: toNumber(row?.unpricedRows),
      }) satisfies IEconomicsLedgerCoverage;
    const ledgers: IEconomicsLedgerCoverage[] = [
      {
        byokRows: 0,
        firstRecordedAt: toIso(revenueLedger[0]?.firstRecordedAt ?? null),
        key: 'revenue',
        lastRecordedAt: toIso(revenueLedger[0]?.lastRecordedAt ?? null),
        pendingRows: 0,
        periodRows: toNumber(revenueLedger[0]?.periodRows),
        unpricedRows: 0,
      },
      cost(llmLedger[0], 'llm'),
      cost(mediaLedger[0], 'media'),
      {
        byokRows: 0,
        firstRecordedAt: toIso(creditLedger[0]?.firstRecordedAt ?? null),
        key: 'credits',
        lastRecordedAt: toIso(creditLedger[0]?.lastRecordedAt ?? null),
        pendingRows: 0,
        periodRows: toNumber(creditLedger[0]?.periodRows),
        unpricedRows: 0,
      },
    ];

    return {
      from: formatUtcDay(window.from),
      ledgers,
      operations: buildOperationCoverage({
        creditsBySource: creditsBySource.map((row) => ({
          credits: toNumber(row.credits),
          source: row.source,
        })),
        llmChatCostMicros: toNumber(llmSplit[0]?.chatCostMicros),
        llmOtherCostMicros: toNumber(llmSplit[0]?.otherCostMicros),
        mediaCostByCategory: mediaByCategory.map((row) => ({
          category: row.category,
          costMicros: toNumber(row.costMicros),
        })),
      }),
      to: formatUtcDay(new Date(window.toExclusive.getTime() - 1)),
    };
  }

  private async readOrganizationLabels(
    ids: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
      return new Map();
    }
    // tenant-scope-ignore: superadmin cross-organization reporting
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, label: true },
      where: { id: { in: unique } },
    });
    return new Map(
      organizations.map((organization) => [
        organization.id,
        organization.label,
      ]),
    );
  }

  private settledCost(alias: string): Prisma.Sql {
    const evidence = Prisma.raw(`${alias}."costEvidence"`);
    const execution = Prisma.raw(`${alias}."workflowExecutionId"`);
    return Prisma.sql`(${execution} IS NULL OR ${evidence} IN (${Prisma.join(SETTLED_COST_EVIDENCE)}))`;
  }

  private revenueByDaySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        to_char("occurredAt", 'YYYY-MM-DD') AS "day",
        COALESCE(SUM("amountMinor"), 0)::bigint AS "revenueMinor",
        COUNT(*)::bigint AS "events"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${span.from}
        AND "occurredAt" < ${span.toExclusive}
      GROUP BY 1
    `;
  }

  private llmByDaySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        to_char(l."createdAt", 'YYYY-MM-DD') AS "day",
        COALESCE(SUM(l."vendorCostMicros") FILTER (WHERE l."isByok" = false), 0)::bigint AS "costMicros",
        COUNT(*)::bigint AS "calls"
      FROM "llm_vendor_costs" l
      WHERE l."isDeleted" = false
        AND ${this.settledCost('l')}
        AND l."createdAt" >= ${span.from}
        AND l."createdAt" < ${span.toExclusive}
      GROUP BY 1
    `;
  }

  private mediaByDaySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        to_char(m."createdAt", 'YYYY-MM-DD') AS "day",
        COALESCE(SUM(m."vendorCostMicros") FILTER (WHERE m."isByok" = false), 0)::bigint AS "costMicros",
        COUNT(*)::bigint AS "calls"
      FROM "media_vendor_costs" m
      WHERE m."isDeleted" = false
        AND ${this.settledCost('m')}
        AND m."createdAt" >= ${span.from}
        AND m."createdAt" < ${span.toExclusive}
      GROUP BY 1
    `;
  }

  private creditsByDaySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        to_char("createdAt", 'YYYY-MM-DD') AS "day",
        COALESCE(SUM(${CREDIT_USAGE_AMOUNT_SQL}), 0)::double precision AS "credits"
      FROM "credit_transactions"
      WHERE "isDeleted" = false
        AND ${CREDIT_USAGE_FILTER_SQL}
        AND "createdAt" >= ${span.from}
        AND "createdAt" < ${span.toExclusive}
      GROUP BY 1
    `;
  }

  /** Distinct paying organizations in the current and the previous window. */
  private payingOrganizationsSql(window: EconomicsWindow): Prisma.Sql {
    return Prisma.sql`
      SELECT
        ("occurredAt" >= ${window.from}) AS "isCurrent",
        COUNT(DISTINCT "organizationId")::bigint AS "organizations"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${window.previousFrom}
        AND "occurredAt" < ${window.toExclusive}
      GROUP BY 1
    `;
  }

  /** Distinct organizations that spent credits in either window. */
  private activeOrganizationsSql(window: EconomicsWindow): Prisma.Sql {
    return Prisma.sql`
      SELECT
        ("createdAt" >= ${window.from}) AS "isCurrent",
        COUNT(DISTINCT "organizationId")::bigint AS "organizations"
      FROM "credit_transactions"
      WHERE "isDeleted" = false
        AND ${CREDIT_USAGE_FILTER_SQL}
        AND "createdAt" >= ${window.previousFrom}
        AND "createdAt" < ${window.toExclusive}
      GROUP BY 1
    `;
  }

  private revenueBySourceByDaySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        to_char("occurredAt", 'YYYY-MM-DD') AS "day",
        "source" AS "source",
        COALESCE(SUM("amountMinor"), 0)::bigint AS "revenueMinor"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${span.from}
        AND "occurredAt" < ${span.toExclusive}
      GROUP BY 1, 2
    `;
  }

  private revenueBySourceSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        "source" AS "source",
        COALESCE(SUM("amountMinor"), 0)::bigint AS "revenueMinor",
        COUNT(*)::bigint AS "events"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${span.from}
        AND "occurredAt" < ${span.toExclusive}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
  }

  private revenueByOrganizationSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        "organizationId" AS "organizationId",
        COALESCE(SUM("amountMinor"), 0)::bigint AS "revenueMinor",
        COUNT(*)::bigint AS "events"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${span.from}
        AND "occurredAt" < ${span.toExclusive}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
      LIMIT ${TOP_REVENUE_ORGANIZATIONS}
    `;
  }

  private latestRevenueSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        "id", "organizationId", "source", "stripeObjectId", "amountMinor", "occurredAt"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${span.from}
        AND "occurredAt" < ${span.toExclusive}
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${LATEST_REVENUE_EVENTS_LIMIT}
    `;
  }

  /** Ledger bounds over all time, plus the period's row and non-USD counts. */
  private revenueLedgerSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        MIN("occurredAt") AS "firstRecordedAt",
        MAX("occurredAt") AS "lastRecordedAt",
        COUNT(*) FILTER (
          WHERE "occurredAt" >= ${span.from} AND "occurredAt" < ${span.toExclusive}
        )::bigint AS "periodRows",
        COUNT(*) FILTER (
          WHERE "currency" <> ${REPORTING_CURRENCY}
            AND "occurredAt" >= ${span.from} AND "occurredAt" < ${span.toExclusive}
        )::bigint AS "nonUsdEvents"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
    `;
  }

  private costLedgerSql(kind: 'llm' | 'media', span: Span): Prisma.Sql {
    const table = Prisma.raw(
      kind === 'llm' ? '"llm_vendor_costs"' : '"media_vendor_costs"',
    );
    return Prisma.sql`
      SELECT
        MIN("createdAt") AS "firstRecordedAt",
        MAX("createdAt") AS "lastRecordedAt",
        COUNT(*) FILTER (
          WHERE "createdAt" >= ${span.from} AND "createdAt" < ${span.toExclusive}
        )::bigint AS "periodRows",
        COUNT(*) FILTER (
          WHERE "isByok" = true
            AND "createdAt" >= ${span.from} AND "createdAt" < ${span.toExclusive}
        )::bigint AS "byokRows",
        COUNT(*) FILTER (
          WHERE "isByok" = false AND "vendorCostMicros" = 0
            AND "createdAt" >= ${span.from} AND "createdAt" < ${span.toExclusive}
        )::bigint AS "unpricedRows",
        COUNT(*) FILTER (
          WHERE "costEvidence" = 'pending'
            AND "createdAt" >= ${span.from} AND "createdAt" < ${span.toExclusive}
        )::bigint AS "pendingRows"
      FROM ${table}
      WHERE "isDeleted" = false
    `;
  }

  private creditLedgerSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        MIN("createdAt") AS "firstRecordedAt",
        MAX("createdAt") AS "lastRecordedAt",
        COUNT(*) FILTER (
          WHERE "createdAt" >= ${span.from} AND "createdAt" < ${span.toExclusive}
        )::bigint AS "periodRows"
      FROM "credit_transactions"
      WHERE "isDeleted" = false
        AND ${CREDIT_USAGE_FILTER_SQL}
    `;
  }

  private creditsBySourceSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        "source" AS "source",
        COALESCE(SUM(${CREDIT_USAGE_AMOUNT_SQL}), 0)::double precision AS "credits"
      FROM "credit_transactions"
      WHERE "isDeleted" = false
        AND ${CREDIT_USAGE_FILTER_SQL}
        AND "createdAt" >= ${span.from}
        AND "createdAt" < ${span.toExclusive}
      GROUP BY 1
    `;
  }

  /** Agent chat is the LLM cost that carries a thread; the rest is other. */
  private llmSplitSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        COALESCE(SUM(l."vendorCostMicros") FILTER (
          WHERE l."isByok" = false AND l."threadId" IS NOT NULL
        ), 0)::bigint AS "chatCostMicros",
        COALESCE(SUM(l."vendorCostMicros") FILTER (
          WHERE l."isByok" = false AND l."threadId" IS NULL
        ), 0)::bigint AS "otherCostMicros"
      FROM "llm_vendor_costs" l
      WHERE l."isDeleted" = false
        AND ${this.settledCost('l')}
        AND l."createdAt" >= ${span.from}
        AND l."createdAt" < ${span.toExclusive}
    `;
  }

  private mediaCategorySql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        UPPER(m."category") AS "category",
        COALESCE(SUM(m."vendorCostMicros") FILTER (WHERE m."isByok" = false), 0)::bigint AS "costMicros",
        COUNT(*)::bigint AS "generations"
      FROM "media_vendor_costs" m
      WHERE m."isDeleted" = false
        AND ${this.settledCost('m')}
        AND m."createdAt" >= ${span.from}
        AND m."createdAt" < ${span.toExclusive}
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `;
  }

  private costFlagsSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT
        COALESCE(SUM("byok"), 0)::bigint AS "byokCalls",
        COALESCE(SUM("unpriced"), 0)::bigint AS "unpricedCalls"
      FROM (
        SELECT
          COUNT(*) FILTER (WHERE l."isByok" = true) AS "byok",
          COUNT(*) FILTER (WHERE l."isByok" = false AND l."vendorCostMicros" = 0) AS "unpriced"
        FROM "llm_vendor_costs" l
        WHERE l."isDeleted" = false
          AND ${this.settledCost('l')}
          AND l."createdAt" >= ${span.from}
          AND l."createdAt" < ${span.toExclusive}

        UNION ALL

        SELECT
          COUNT(*) FILTER (WHERE m."isByok" = true),
          COUNT(*) FILTER (WHERE m."isByok" = false AND m."vendorCostMicros" = 0)
        FROM "media_vendor_costs" m
        WHERE m."isDeleted" = false
          AND ${this.settledCost('m')}
          AND m."createdAt" >= ${span.from}
          AND m."createdAt" < ${span.toExclusive}
      ) "flags"
    `;
  }

  private costModelsSql(span: Span): Prisma.Sql {
    return Prisma.sql`
      SELECT * FROM (
        SELECT
          'llm' AS "kind",
          l."provider" AS "provider",
          l."model" AS "model",
          COUNT(*)::bigint AS "calls",
          COUNT(*) FILTER (WHERE l."isByok" = true)::bigint AS "byokCalls",
          COUNT(*) FILTER (WHERE l."isByok" = false AND l."vendorCostMicros" = 0)::bigint AS "unpricedCalls",
          COALESCE(SUM(l."promptTokens"), 0)::bigint AS "promptTokens",
          COALESCE(SUM(l."completionTokens"), 0)::bigint AS "completionTokens",
          COALESCE(SUM(l."vendorCostMicros") FILTER (WHERE l."isByok" = false), 0)::bigint AS "costMicros"
        FROM "llm_vendor_costs" l
        WHERE l."isDeleted" = false
          AND ${this.settledCost('l')}
          AND l."createdAt" >= ${span.from}
          AND l."createdAt" < ${span.toExclusive}
        GROUP BY l."provider", l."model"

        UNION ALL

        SELECT
          'media' AS "kind",
          m."provider" AS "provider",
          m."model" AS "model",
          COUNT(*)::bigint AS "calls",
          COUNT(*) FILTER (WHERE m."isByok" = true)::bigint AS "byokCalls",
          COUNT(*) FILTER (WHERE m."isByok" = false AND m."vendorCostMicros" = 0)::bigint AS "unpricedCalls",
          0::bigint AS "promptTokens",
          0::bigint AS "completionTokens",
          COALESCE(SUM(m."vendorCostMicros") FILTER (WHERE m."isByok" = false), 0)::bigint AS "costMicros"
        FROM "media_vendor_costs" m
        WHERE m."isDeleted" = false
          AND ${this.settledCost('m')}
          AND m."createdAt" >= ${span.from}
          AND m."createdAt" < ${span.toExclusive}
        GROUP BY m."provider", m."model"
      ) "models"
      ORDER BY "costMicros" DESC, "calls" DESC, "model" ASC
      LIMIT ${COST_MODEL_ROW_LIMIT}
    `;
  }
}

interface Span {
  from: Date;
  toExclusive: Date;
}
