import {
  buildUnitEconomicsRows,
  EMPTY_UNIT_ECONOMICS_AGGREGATE,
  type UnitEconomicsAggregate,
} from '@api/endpoints/admin/unit-economics/unit-economics-report.util';
import { resolveCostReportRange } from '@api/endpoints/cost-reporting/cost-reporting-query.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type {
  IUnitEconomicsQuery,
  IUnitEconomicsReport,
  IUnitEconomicsTopModel,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

type NumericSqlValue = bigint | number | string | null;

interface RevenueRow {
  key: string | null;
  revenueMinor: NumericSqlValue;
}

interface CreditRow {
  agentChatCredits: NumericSqlValue;
  generationCredits: NumericSqlValue;
  key: string | null;
}

interface LlmRow {
  agentTurns: NumericSqlValue;
  key: string | null;
  llmProviderCostMicros: NumericSqlValue;
}

interface MediaRow {
  key: string | null;
  mediaProviderCostMicros: NumericSqlValue;
}

interface TopModelRow {
  costMicros: NumericSqlValue;
  key: string | null;
  model: string;
}

interface ReportScope {
  from: Date;
  /** Set for a per-user drill-down inside one organization. */
  organizationId?: string;
  to: Date;
}

const TOP_MODELS_PER_ROW = 3;
const REPORTING_CURRENCY = 'usd';
const UNATTRIBUTED_KEY = '';
const UNATTRIBUTED_LABEL = 'Unattributed';
/** Workflow-attributed ledger rows count once they are settled. */
const SETTLED_COST_EVIDENCE = ['observed', 'calculated', 'byok'];

function toNumber(value: NumericSqlValue): number {
  if (value === null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toKey(value: string | null): string {
  return value ?? UNATTRIBUTED_KEY;
}

/**
 * Platform-admin unit economics. Cross-tenant on purpose (superadmin only):
 * every query is bounded by the period and `isDeleted = false`, and a
 * drill-down additionally pins one `organizationId`. Aggregation runs in
 * Postgres over the period indexes added with the revenue ledger.
 */
@Injectable()
export class UnitEconomicsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(query: IUnitEconomicsQuery): Promise<IUnitEconomicsReport> {
    const range = resolveCostReportRange(query);
    const scope: ReportScope = {
      from: range.from,
      organizationId: query.organizationId,
      to: range.to,
    };
    const organizationLabel = scope.organizationId
      ? await this.readOrganizationLabel(scope.organizationId)
      : null;

    // tenant-scope-ignore: superadmin cross-organization reporting
    const [revenueRows, creditRows, llmRows, mediaRows, topModelRows] =
      await Promise.all([
        this.prisma.$queryRaw<RevenueRow[]>(this.revenueSql(scope)),
        this.prisma.$queryRaw<CreditRow[]>(this.creditSql(scope)),
        this.prisma.$queryRaw<LlmRow[]>(this.llmSql(scope)),
        this.prisma.$queryRaw<MediaRow[]>(this.mediaSql(scope)),
        this.prisma.$queryRaw<TopModelRow[]>(this.topModelsSql(scope)),
      ]);

    const aggregates = new Map<string, UnitEconomicsAggregate>();
    const aggregateFor = (key: string | null): UnitEconomicsAggregate => {
      const normalized = toKey(key);
      const existing = aggregates.get(normalized);
      if (existing) return existing;
      const created = { ...EMPTY_UNIT_ECONOMICS_AGGREGATE };
      aggregates.set(normalized, created);
      return created;
    };

    for (const row of revenueRows) {
      aggregateFor(row.key).revenueMinor += toNumber(row.revenueMinor);
    }
    for (const row of creditRows) {
      const aggregate = aggregateFor(row.key);
      aggregate.agentChatCredits += toNumber(row.agentChatCredits);
      aggregate.generationCredits += toNumber(row.generationCredits);
    }
    for (const row of llmRows) {
      const aggregate = aggregateFor(row.key);
      aggregate.llmProviderCostMicros += toNumber(row.llmProviderCostMicros);
      aggregate.agentTurns += toNumber(row.agentTurns);
    }
    for (const row of mediaRows) {
      aggregateFor(row.key).mediaProviderCostMicros += toNumber(
        row.mediaProviderCostMicros,
      );
    }

    const topModels = new Map<string, IUnitEconomicsTopModel[]>();
    for (const row of topModelRows) {
      const key = toKey(row.key);
      const models = topModels.get(key) ?? [];
      models.push({
        model: row.model,
        providerCostUsd: Number(
          (toNumber(row.costMicros) / 1_000_000).toFixed(6),
        ),
      });
      topModels.set(key, models);
    }

    const labels = await this.readLabels([...aggregates.keys()], scope);
    const { rows, totals } = buildUnitEconomicsRows(
      [...aggregates.entries()].map(([key, aggregate]) => ({
        aggregate,
        id: key,
        label: labels.get(key) ?? (key || UNATTRIBUTED_LABEL),
        topModels: topModels.get(key) ?? [],
      })),
    );

    return {
      from: range.from.toISOString(),
      organizationId: scope.organizationId ?? null,
      organizationLabel,
      rows,
      to: range.to.toISOString(),
      totals,
    };
  }

  private async readOrganizationLabel(organizationId: string): Promise<string> {
    // tenant-scope-ignore: superadmin drill-down resolves the target org
    const organization = await this.prisma.organization.findFirst({
      select: { label: true },
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization', organizationId);
    }
    return organization.label;
  }

  private async readLabels(
    keys: string[],
    scope: ReportScope,
  ): Promise<Map<string, string>> {
    const ids = keys.filter((key) => key !== UNATTRIBUTED_KEY);
    const labels = new Map<string, string>([
      [UNATTRIBUTED_KEY, UNATTRIBUTED_LABEL],
    ]);
    if (ids.length === 0) {
      return labels;
    }

    if (scope.organizationId) {
      // tenant-scope-ignore: users are platform identities, keyed by ledger actors
      const users = await this.prisma.user.findMany({
        select: {
          email: true,
          firstName: true,
          handle: true,
          id: true,
          lastName: true,
          name: true,
        },
        where: { id: { in: ids } },
      });
      for (const user of users) {
        const fullName = [user.firstName, user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim();
        labels.set(
          user.id,
          user.email || user.name || fullName || user.handle || user.id,
        );
      }
      return labels;
    }

    // tenant-scope-ignore: superadmin cross-organization reporting
    const organizations = await this.prisma.organization.findMany({
      select: { id: true, label: true },
      where: { id: { in: ids } },
    });
    for (const organization of organizations) {
      labels.set(organization.id, organization.label);
    }
    return labels;
  }

  private organizationFilter(scope: ReportScope, alias?: string): Prisma.Sql {
    if (!scope.organizationId) {
      return Prisma.empty;
    }
    const column = alias
      ? Prisma.raw(`${alias}."organizationId"`)
      : Prisma.raw('"organizationId"');
    return Prisma.sql`AND ${column} = ${scope.organizationId}`;
  }

  /** Grouping key: organization, or the acting user inside a drill-down. */
  private groupKey(scope: ReportScope, userColumn: string): Prisma.Sql {
    return Prisma.raw(scope.organizationId ? userColumn : '"organizationId"');
  }

  revenueSql(scope: ReportScope): Prisma.Sql {
    return Prisma.sql`
      SELECT
        ${this.groupKey(scope, '"userId"')} AS "key",
        SUM("amountMinor")::bigint AS "revenueMinor"
      FROM "billing_revenue_events"
      WHERE "isDeleted" = false
        AND "currency" = ${REPORTING_CURRENCY}
        AND "occurredAt" >= ${scope.from}
        AND "occurredAt" <= ${scope.to}
        ${this.organizationFilter(scope)}
      GROUP BY 1
    `;
  }

  creditSql(scope: ReportScope): Prisma.Sql {
    const signedAmount = Prisma.sql`CASE WHEN "category" = ${CreditTransactionCategory.REFUND} THEN -ABS("amount") ELSE ABS("amount") END`;
    return Prisma.sql`
      SELECT
        ${this.groupKey(scope, '"actorUserId"')} AS "key",
        COALESCE(SUM(${signedAmount}) FILTER (WHERE "source" = ${ActivitySource.AGENT_CHAT}), 0)::double precision AS "agentChatCredits",
        COALESCE(SUM(${signedAmount}) FILTER (WHERE "source" IS DISTINCT FROM ${ActivitySource.AGENT_CHAT}), 0)::double precision AS "generationCredits"
      FROM "credit_transactions"
      WHERE "isDeleted" = false
        AND "category" IN (${CreditTransactionCategory.DEDUCT}, ${CreditTransactionCategory.REFUND})
        AND "createdAt" >= ${scope.from}
        AND "createdAt" <= ${scope.to}
        ${this.organizationFilter(scope)}
      GROUP BY 1
    `;
  }

  llmSql(scope: ReportScope): Prisma.Sql {
    return Prisma.sql`
      SELECT
        ${this.groupKey(scope, '"userId"')} AS "key",
        COALESCE(SUM("vendorCostMicros") FILTER (WHERE "isByok" = false), 0)::bigint AS "llmProviderCostMicros",
        COUNT(DISTINCT "runId") FILTER (WHERE "threadId" IS NOT NULL)::bigint AS "agentTurns"
      FROM "llm_vendor_costs"
      WHERE "isDeleted" = false
        AND ("workflowExecutionId" IS NULL OR "costEvidence" IN (${Prisma.join(SETTLED_COST_EVIDENCE)}))
        AND "createdAt" >= ${scope.from}
        AND "createdAt" <= ${scope.to}
        ${this.organizationFilter(scope)}
      GROUP BY 1
    `;
  }

  /** Media rows carry no actor; a drill-down attributes them via the ingredient. */
  private mediaSource(scope: ReportScope): Prisma.Sql {
    return scope.organizationId
      ? Prisma.sql`"media_vendor_costs" m
        LEFT JOIN "ingredients" i
          ON i."id" = m."ingredientId"
          AND i."organizationId" = m."organizationId"`
      : Prisma.sql`"media_vendor_costs" m`;
  }

  mediaSql(scope: ReportScope): Prisma.Sql {
    return Prisma.sql`
      SELECT
        ${this.groupKey(scope, 'i."userId"')} AS "key",
        COALESCE(SUM(m."vendorCostMicros") FILTER (WHERE m."isByok" = false), 0)::bigint AS "mediaProviderCostMicros"
      FROM ${this.mediaSource(scope)}
      WHERE m."isDeleted" = false
        AND (m."workflowExecutionId" IS NULL OR m."costEvidence" IN (${Prisma.join(SETTLED_COST_EVIDENCE)}))
        AND m."createdAt" >= ${scope.from}
        AND m."createdAt" <= ${scope.to}
        ${this.organizationFilter(scope, 'm')}
      GROUP BY 1
    `;
  }

  topModelsSql(scope: ReportScope): Prisma.Sql {
    const mediaKey = scope.organizationId
      ? Prisma.raw('i."userId"')
      : Prisma.raw('m."organizationId"');
    return Prisma.sql`
      WITH "modelCosts" AS (
        SELECT
          ${this.groupKey(scope, '"userId"')} AS "key",
          "model" AS "model",
          SUM("vendorCostMicros")::bigint AS "costMicros"
        FROM "llm_vendor_costs"
        WHERE "isDeleted" = false
          AND "isByok" = false
          AND ("workflowExecutionId" IS NULL OR "costEvidence" IN (${Prisma.join(SETTLED_COST_EVIDENCE)}))
          AND "createdAt" >= ${scope.from}
          AND "createdAt" <= ${scope.to}
          ${this.organizationFilter(scope)}
        GROUP BY 1, 2

        UNION ALL

        SELECT
          ${mediaKey} AS "key",
          m."model" AS "model",
          SUM(m."vendorCostMicros")::bigint AS "costMicros"
        FROM ${this.mediaSource(scope)}
        WHERE m."isDeleted" = false
          AND m."isByok" = false
          AND (m."workflowExecutionId" IS NULL OR m."costEvidence" IN (${Prisma.join(SETTLED_COST_EVIDENCE)}))
          AND m."createdAt" >= ${scope.from}
          AND m."createdAt" <= ${scope.to}
          ${this.organizationFilter(scope, 'm')}
        GROUP BY 1, 2
      ),
      "ranked" AS (
        SELECT
          "key",
          "model",
          SUM("costMicros")::bigint AS "costMicros",
          ROW_NUMBER() OVER (
            PARTITION BY "key"
            ORDER BY SUM("costMicros") DESC, "model" ASC
          ) AS "rank"
        FROM "modelCosts"
        GROUP BY "key", "model"
      )
      SELECT "key", "model", "costMicros"
      FROM "ranked"
      WHERE "rank" <= ${TOP_MODELS_PER_ROW}
        AND "costMicros" > 0
      ORDER BY "key" ASC, "rank" ASC
    `;
  }
}
