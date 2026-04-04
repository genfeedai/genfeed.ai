import {
  AdOptimizationAuditLog,
  type AdOptimizationAuditLogDocument,
} from '@api/collections/ad-optimization-audit-logs/schemas/ad-optimization-audit-log.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AdOptimizationAuditLogsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdOptimizationAuditLog.name, DB_CONNECTIONS.CLOUD)
    private readonly auditLogModel: Model<AdOptimizationAuditLogDocument>,
    private readonly logger: LoggerService,
  ) {}

  async create(
    data: Partial<AdOptimizationAuditLog>,
  ): Promise<AdOptimizationAuditLogDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const doc = await this.auditLogModel.create(data);
      this.logger.log(`${caller} created audit log for run ${data.runId}`);
      return doc;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findByOrganization(
    organizationId: string,
    params?: {
      limit?: number;
      offset?: number;
    },
  ): Promise<AdOptimizationAuditLogDocument[]> {
    return this.auditLogModel
      .find({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .sort({ runDate: -1 })
      .skip(params?.offset || 0)
      .limit(params?.limit || 50)
      .lean()
      .exec();
  }
}
