import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type {
  AgentStrategyReport,
  AgentStrategyReportDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy-report.schema';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '@api/helpers/utils/paginated-result/paginated-result.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CreateReportInput = Omit<
  AgentStrategyReport,
  | 'brand'
  | 'createdAt'
  | 'data'
  | 'id'
  | 'isDeleted'
  | 'organization'
  | 'strategy'
  | 'updatedAt'
> & {
  strategyId: string;
  organizationId: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AgentStrategyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private toDate(value: unknown): Date | undefined {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private normalizeReport(
    record: Record<string, unknown>,
  ): AgentStrategyReportDocument {
    const data = this.isPlainObject(record.data) ? record.data : {};

    return {
      ...(record as unknown as AgentStrategyReportDocument),
      brand:
        typeof record.brandId === 'string' || record.brandId === null
          ? (record.brandId as string | null)
          : undefined,
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      strategy:
        typeof record.strategyId === 'string' ? record.strategyId : undefined,
      ...(data as Partial<AgentStrategyReportDocument>),
      periodEnd:
        this.toDate(data.periodEnd) ??
        (typeof data.periodEnd === 'string' ? data.periodEnd : undefined),
      periodStart:
        this.toDate(data.periodStart) ??
        (typeof data.periodStart === 'string' ? data.periodStart : undefined),
      reportType:
        typeof data.reportType === 'string'
          ? (data.reportType as AgentStrategyReportType)
          : undefined,
    };
  }

  /**
   * One page of a strategy's reports, newest first. Reports are written as
   * each period closes, so creation order is period order; `periodEnd` lives
   * in the `data` JSON column, which the database cannot order by.
   */
  async listByStrategy(
    strategyId: string,
    organizationId: string,
    paging: { limit: number; page: number },
    reportType?: AgentStrategyReportType,
  ): Promise<PaginatedResult<AgentStrategyReportDocument>> {
    const { limit, page } = paging;
    const where = scopedWhere(organizationId, {
      ...(reportType
        ? { data: { equals: reportType, path: ['reportType'] } }
        : {}),
      strategyId,
    });
    const [records, totalDocs] = await Promise.all([
      this.prisma.agentStrategyReport.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.agentStrategyReport.count({ where }),
    ]);

    return buildPaginatedResult(
      records.map((record) =>
        this.normalizeReport(record as unknown as Record<string, unknown>),
      ),
      totalDocs,
      page,
      limit,
    );
  }

  async getLatest(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument | null> {
    const { docs } = await this.listByStrategy(
      strategyId,
      organizationId,
      { limit: 1, page: 1 },
      reportType,
    );

    return docs[0] ?? null;
  }

  async createReport(
    input: CreateReportInput,
  ): Promise<AgentStrategyReportDocument> {
    const { strategyId, organizationId, brandId, metadata, ...reportData } =
      input;
    const created = await this.prisma.agentStrategyReport.create({
      data: {
        brandId: typeof brandId === 'string' ? brandId : null,
        data: toPrismaJson({
          ...reportData,
          metadata: metadata ?? {},
        }),
        isDeleted: false,
        organizationId,
        strategyId,
      },
    });

    this.logger.log('Created agent strategy report', {
      reportId: created.id,
      reportType: input.reportType,
      strategyId: input.strategyId,
    });

    return this.normalizeReport(created as unknown as Record<string, unknown>);
  }
}
