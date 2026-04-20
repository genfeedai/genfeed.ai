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
  'id' | 'createdAt' | 'isDeleted' | 'updatedAt'
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

  listByStrategy(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument[]> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      strategyId,
    };

    if (reportType) {
      where.reportType = reportType;
    }

    return this.prisma.agentStrategyReport.findMany({
      where,
      orderBy: { periodEnd: 'desc' },
    }) as Promise<AgentStrategyReportDocument[]>;
  }

  getLatest(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument | null> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      organizationId,
      strategyId,
    };

    if (reportType) {
      where.reportType = reportType;
    }

    return this.prisma.agentStrategyReport.findFirst({
      where,
      orderBy: { periodEnd: 'desc' },
    }) as Promise<AgentStrategyReportDocument | null>;
  }

  async createReport(
    input: CreateReportInput,
  ): Promise<AgentStrategyReportDocument> {
    const created = await this.prisma.agentStrategyReport.create({
      data: {
        ...input,
        isDeleted: false,
        metadata: input.metadata ?? {},
      },
    });

    this.logger.log('Created agent strategy report', {
      reportId: created.id,
      reportType: input.reportType,
      strategyId: input.strategyId,
    });

    return created as AgentStrategyReportDocument;
  }
}
