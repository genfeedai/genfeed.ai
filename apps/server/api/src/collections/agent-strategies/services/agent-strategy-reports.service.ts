import { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import type {
  AgentStrategyReport,
  AgentStrategyReportDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy-report.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type CreateReportInput = Omit<
  AgentStrategyReport,
  | '_id'
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
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
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

  private getPeriodEndTimestamp(report: AgentStrategyReportDocument): number {
    const periodEnd =
      report.periodEnd instanceof Date
        ? report.periodEnd
        : typeof report.periodEnd === 'string'
          ? new Date(report.periodEnd)
          : undefined;

    return periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.getTime()
      : 0;
  }

  async listByStrategy(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument[]> {
    const records = await this.prisma.agentStrategyReport.findMany({
      where: {
        isDeleted: false,
        organizationId,
        strategyId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return records
      .map((record) =>
        this.normalizeReport(record as unknown as Record<string, unknown>),
      )
      .filter((record) => !reportType || record.reportType === reportType)
      .sort(
        (left, right) =>
          this.getPeriodEndTimestamp(right) - this.getPeriodEndTimestamp(left),
      );
  }

  async getLatest(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument | null> {
    const reports = await this.listByStrategy(
      strategyId,
      organizationId,
      reportType,
    );

    return reports[0] ?? null;
  }

  async createReport(
    input: CreateReportInput,
  ): Promise<AgentStrategyReportDocument> {
    const { strategyId, organizationId, brandId, metadata, ...reportData } =
      input;
    const created = await this.prisma.agentStrategyReport.create({
      data: {
        brandId: typeof brandId === 'string' ? brandId : null,
        data: {
          ...reportData,
          metadata: metadata ?? {},
        } as never,
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
