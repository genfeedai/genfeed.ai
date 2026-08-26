import { resolveCostReportRange } from '@api/endpoints/cost-reporting/cost-reporting-query.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import type {
  CostReportEntryType,
  ICostReportBrandTotals,
  ICostReportDailyTotals,
  ICostReportEntries,
  ICostReportEntriesQuery,
  ICostReportEntry,
  ICostReportQuery,
  ICostReportSummary,
  ICostReportTotals,
} from '@genfeedai/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import { BadRequestException, Injectable } from '@nestjs/common';

const DEFAULT_ENTRY_LIMIT = 50;
const EXPORT_ENTRY_LIMIT = 10_000;

type NumericSqlValue = bigint | number | string | null;

interface CostBrandSummaryRow {
  brandId: string | null;
  brandLabel: string;
  byokCount: NumericSqlValue;
  creditsUsed: NumericSqlValue;
  generationCount: NumericSqlValue;
  llmCount: NumericSqlValue;
  mediaCount: NumericSqlValue;
  providerCostMicros: NumericSqlValue;
}

interface CostDailySummaryRow {
  byokCount: NumericSqlValue;
  creditsUsed: NumericSqlValue;
  date: string;
  generationCount: NumericSqlValue;
  providerCostMicros: NumericSqlValue;
}

interface CostEntryRow {
  brandId: string | null;
  brandLabel: string;
  category: string | null;
  createdAt: Date | string;
  creditsUsed: NumericSqlValue;
  entryType: CostReportEntryType;
  id: string;
  isByok: boolean;
  model: string | null;
  provider: string | null;
  providerCostMicros: NumericSqlValue;
  referenceId: string | null;
  totalCount: NumericSqlValue;
}

@Injectable()
export class CostReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(
    organizationId: string,
    query: ICostReportQuery,
  ): Promise<ICostReportSummary> {
    await this.validateBrandScope(organizationId, query.brandId);
    const range = resolveCostReportRange(query);
    const events = this.normalizedEventsSql({
      brandId: query.brandId,
      from: range.from,
      organizationId,
      to: range.to,
    });

    const [brandRows, dailyRows] = await Promise.all([
      this.prisma.$queryRaw<CostBrandSummaryRow[]>(Prisma.sql`
        WITH "costEvents" AS (${events})
        SELECT
          b."id" AS "brandId",
          COALESCE(b."label", 'Unattributed') AS "brandLabel",
          SUM(e."byokCount")::bigint AS "byokCount",
          SUM(e."creditsUsed")::double precision AS "creditsUsed",
          SUM(e."generationCount")::bigint AS "generationCount",
          SUM(e."llmCount")::bigint AS "llmCount",
          SUM(e."mediaCount")::bigint AS "mediaCount",
          SUM(e."providerCostMicros")::bigint AS "providerCostMicros"
        FROM "costEvents" e
        LEFT JOIN "brands" b
          ON b."id" = e."brandId"
          AND b."organizationId" = ${organizationId}
          AND b."isDeleted" = false
        GROUP BY b."id", b."label"
        ORDER BY "providerCostMicros" DESC, "creditsUsed" DESC, "brandLabel" ASC
      `),
      this.prisma.$queryRaw<CostDailySummaryRow[]>(Prisma.sql`
        WITH "costEvents" AS (${events})
        SELECT
          TO_CHAR(e."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "date",
          SUM(e."byokCount")::bigint AS "byokCount",
          SUM(e."creditsUsed")::double precision AS "creditsUsed",
          SUM(e."generationCount")::bigint AS "generationCount",
          SUM(e."providerCostMicros")::bigint AS "providerCostMicros"
        FROM "costEvents" e
        GROUP BY "date"
        ORDER BY "date" ASC
      `),
    ]);

    const byBrand = brandRows.map((row) => this.mapBrandSummary(row));
    const total = byBrand.reduce<ICostReportTotals>(
      (accumulator, row) => ({
        byokCount: accumulator.byokCount + row.byokCount,
        creditsUsed: accumulator.creditsUsed + row.creditsUsed,
        generationCount: accumulator.generationCount + row.generationCount,
        llmCount: accumulator.llmCount + row.llmCount,
        mediaCount: accumulator.mediaCount + row.mediaCount,
        providerCostMicros:
          accumulator.providerCostMicros + row.providerCostMicros,
        providerCostUsd: accumulator.providerCostUsd + row.providerCostUsd,
      }),
      this.emptyTotals(),
    );
    total.providerCostUsd = total.providerCostMicros / 1_000_000;

    return {
      byBrand,
      daily: dailyRows.map((row) => this.mapDailySummary(row)),
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      total,
    };
  }

  async getEntries(
    organizationId: string,
    query: ICostReportEntriesQuery,
  ): Promise<ICostReportEntries> {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_ENTRY_LIMIT, 1),
      DEFAULT_ENTRY_LIMIT * 4,
    );
    const skip = Math.max(query.skip ?? 0, 0);
    const rows = await this.queryEntries(organizationId, query, limit, skip);

    return {
      docs: rows.map((row) => this.mapEntry(row)),
      limit,
      skip,
      total: this.toNumber(rows.at(0)?.totalCount),
    };
  }

  async getExportEntries(
    organizationId: string,
    query: ICostReportQuery,
  ): Promise<ICostReportEntry[]> {
    const rows = await this.queryEntries(
      organizationId,
      query,
      EXPORT_ENTRY_LIMIT,
      0,
    );
    return rows.map((row) => this.mapEntry(row));
  }

  private async queryEntries(
    organizationId: string,
    query: ICostReportQuery,
    limit: number,
    skip: number,
  ): Promise<CostEntryRow[]> {
    await this.validateBrandScope(organizationId, query.brandId);
    const range = resolveCostReportRange(query);
    const events = this.normalizedEventsSql({
      brandId: query.brandId,
      from: range.from,
      organizationId,
      to: range.to,
    });

    return this.prisma.$queryRaw<CostEntryRow[]>(Prisma.sql`
      WITH "costEvents" AS (${events})
      SELECT
        e."id" AS "id",
        e."entryType" AS "entryType",
        b."id" AS "brandId",
        COALESCE(b."label", 'Unattributed') AS "brandLabel",
        e."provider" AS "provider",
        e."model" AS "model",
        e."category" AS "category",
        e."referenceId" AS "referenceId",
        e."providerCostMicros" AS "providerCostMicros",
        e."creditsUsed" AS "creditsUsed",
        e."isByok" AS "isByok",
        e."createdAt" AS "createdAt",
        COUNT(*) OVER()::bigint AS "totalCount"
      FROM "costEvents" e
      LEFT JOIN "brands" b
        ON b."id" = e."brandId"
        AND b."organizationId" = ${organizationId}
        AND b."isDeleted" = false
      ORDER BY e."createdAt" DESC, e."id" DESC
      LIMIT ${limit}
      OFFSET ${skip}
    `);
  }

  private normalizedEventsSql(options: {
    brandId?: string;
    from: Date;
    organizationId: string;
    to: Date;
  }): Prisma.Sql {
    const ledgerBrandFilter = options.brandId
      ? Prisma.sql`AND "brandId" = ${options.brandId}`
      : Prisma.empty;
    const creditBrandFilter = options.brandId
      ? Prisma.sql`AND "metadata"->>'brandId' = ${options.brandId}`
      : Prisma.empty;

    return Prisma.sql`
      SELECT
        "id" AS "id",
        'llm'::text AS "entryType",
        "brandId" AS "brandId",
        "provider" AS "provider",
        "model" AS "model",
        'llm'::text AS "category",
        COALESCE("runId", "threadId") AS "referenceId",
        "vendorCostMicros"::bigint AS "providerCostMicros",
        0::double precision AS "creditsUsed",
        "isByok" AS "isByok",
        CASE WHEN "isByok" THEN 1 ELSE 0 END::bigint AS "byokCount",
        1::bigint AS "generationCount",
        1::bigint AS "llmCount",
        0::bigint AS "mediaCount",
        "createdAt" AS "createdAt"
      FROM "llm_vendor_costs"
      WHERE "organizationId" = ${options.organizationId}
        AND "isDeleted" = false
        AND "createdAt" >= ${options.from}
        AND "createdAt" <= ${options.to}
        ${ledgerBrandFilter}

      UNION ALL

      SELECT
        "id" AS "id",
        'media'::text AS "entryType",
        "brandId" AS "brandId",
        "provider" AS "provider",
        "model" AS "model",
        "category" AS "category",
        "ingredientId" AS "referenceId",
        "vendorCostMicros"::bigint AS "providerCostMicros",
        0::double precision AS "creditsUsed",
        "isByok" AS "isByok",
        CASE WHEN "isByok" THEN 1 ELSE 0 END::bigint AS "byokCount",
        1::bigint AS "generationCount",
        0::bigint AS "llmCount",
        1::bigint AS "mediaCount",
        "createdAt" AS "createdAt"
      FROM "media_vendor_costs"
      WHERE "organizationId" = ${options.organizationId}
        AND "isDeleted" = false
        AND "createdAt" >= ${options.from}
        AND "createdAt" <= ${options.to}
        ${ledgerBrandFilter}

      UNION ALL

      SELECT
        "id" AS "id",
        'credit'::text AS "entryType",
        NULLIF("metadata"->>'brandId', '') AS "brandId",
        NULL::text AS "provider",
        NULL::text AS "model",
        COALESCE("source", "category", 'credits') AS "category",
        "referenceId" AS "referenceId",
        0::bigint AS "providerCostMicros",
        ABS("amount")::double precision AS "creditsUsed",
        false AS "isByok",
        0::bigint AS "byokCount",
        0::bigint AS "generationCount",
        0::bigint AS "llmCount",
        0::bigint AS "mediaCount",
        "createdAt" AS "createdAt"
      FROM "credit_transactions"
      WHERE "organizationId" = ${options.organizationId}
        AND "isDeleted" = false
        AND "category" = ${CreditTransactionCategory.DEDUCT}
        AND "createdAt" >= ${options.from}
        AND "createdAt" <= ${options.to}
        ${creditBrandFilter}
    `;
  }

  private async validateBrandScope(
    organizationId: string,
    brandId?: string,
  ): Promise<void> {
    if (!brandId) {
      return;
    }

    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: {
        id: brandId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in the authenticated organization',
      );
    }
  }

  private mapBrandSummary(row: CostBrandSummaryRow): ICostReportBrandTotals {
    const providerCostMicros = this.toNumber(row.providerCostMicros);
    return {
      brandId: row.brandId,
      brandLabel: row.brandLabel,
      byokCount: this.toNumber(row.byokCount),
      creditsUsed: this.toNumber(row.creditsUsed),
      generationCount: this.toNumber(row.generationCount),
      llmCount: this.toNumber(row.llmCount),
      mediaCount: this.toNumber(row.mediaCount),
      providerCostMicros,
      providerCostUsd: providerCostMicros / 1_000_000,
    };
  }

  private mapDailySummary(row: CostDailySummaryRow): ICostReportDailyTotals {
    const providerCostMicros = this.toNumber(row.providerCostMicros);
    return {
      byokCount: this.toNumber(row.byokCount),
      creditsUsed: this.toNumber(row.creditsUsed),
      date: row.date,
      generationCount: this.toNumber(row.generationCount),
      providerCostMicros,
      providerCostUsd: providerCostMicros / 1_000_000,
    };
  }

  private mapEntry(row: CostEntryRow): ICostReportEntry {
    const providerCostMicros = this.toNumber(row.providerCostMicros);
    return {
      brandId: row.brandId,
      brandLabel: row.brandLabel,
      category: row.category,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      creditsUsed: this.toNumber(row.creditsUsed),
      entryType: row.entryType,
      id: row.id,
      isByok: row.isByok,
      model: row.model,
      provider: row.provider,
      providerCostMicros,
      providerCostUsd: providerCostMicros / 1_000_000,
      referenceId: row.referenceId,
    };
  }

  private emptyTotals(): ICostReportTotals {
    return {
      byokCount: 0,
      creditsUsed: 0,
      generationCount: 0,
      llmCount: 0,
      mediaCount: 0,
      providerCostMicros: 0,
      providerCostUsd: 0,
    };
  }

  private toNumber(value: NumericSqlValue | undefined): number {
    return Number(value ?? 0);
  }
}
