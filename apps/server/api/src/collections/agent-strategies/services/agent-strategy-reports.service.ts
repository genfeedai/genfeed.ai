import type { AgentStrategyReportType } from '@api/collections/agent-strategies/schemas/agent-strategy-policy.schema';
import {
  AgentStrategyReport,
  type AgentStrategyReportDocument,
} from '@api/collections/agent-strategies/schemas/agent-strategy-report.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

type CreateReportInput = Omit<
  AgentStrategyReport,
  '_id' | 'createdAt' | 'isDeleted' | 'updatedAt'
> & {
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AgentStrategyReportsService {
  constructor(
    @InjectModel(AgentStrategyReport.name, DB_CONNECTIONS.AGENT)
    private readonly model: AggregatePaginateModel<AgentStrategyReportDocument>,
    private readonly logger: LoggerService,
  ) {}

  listByStrategy(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument[]> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      strategy: new Types.ObjectId(strategyId),
    };

    if (reportType) {
      query.reportType = reportType;
    }

    return this.model.find(query).sort({ periodEnd: -1 }).exec();
  }

  getLatest(
    strategyId: string,
    organizationId: string,
    reportType?: AgentStrategyReportType,
  ): Promise<AgentStrategyReportDocument | null> {
    const query: Record<string, unknown> = {
      isDeleted: false,
      organization: new Types.ObjectId(organizationId),
      strategy: new Types.ObjectId(strategyId),
    };

    if (reportType) {
      query.reportType = reportType;
    }

    return this.model.findOne(query).sort({ periodEnd: -1 }).exec();
  }

  async createReport(
    input: CreateReportInput,
  ): Promise<AgentStrategyReportDocument> {
    const created = await this.model.create({
      ...input,
      isDeleted: false,
      metadata: input.metadata ?? {},
    });

    this.logger.log('Created agent strategy report', {
      reportId: String(created._id),
      reportType: input.reportType,
      strategyId: String(input.strategy),
    });

    return created;
  }
}
