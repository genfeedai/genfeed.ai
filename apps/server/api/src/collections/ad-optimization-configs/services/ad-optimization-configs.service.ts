import {
  AdOptimizationConfig,
  type AdOptimizationConfigDocument,
} from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';

@Injectable()
export class AdOptimizationConfigsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    @InjectModel(AdOptimizationConfig.name, DB_CONNECTIONS.CLOUD)
    private readonly adOptimizationConfigModel: Model<AdOptimizationConfigDocument>,
    private readonly logger: LoggerService,
  ) {}

  async findByOrganization(
    organizationId: string,
  ): Promise<AdOptimizationConfigDocument | null> {
    return this.adOptimizationConfigModel
      .findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .lean()
      .exec();
  }

  async upsert(
    organizationId: string,
    data: Partial<AdOptimizationConfig>,
  ): Promise<AdOptimizationConfigDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const result = await this.adOptimizationConfigModel
        .findOneAndUpdate(
          {
            isDeleted: false,
            organization: new Types.ObjectId(organizationId),
          },
          {
            $set: {
              ...data,
              organization: new Types.ObjectId(organizationId),
            },
          },
          { new: true, upsert: true },
        )
        .lean()
        .exec();

      this.logger.log(
        `${caller} upserted optimization config for org ${organizationId}`,
      );
      return result;
    } catch (error: unknown) {
      this.logger.error(`${caller} failed`, error);
      throw error;
    }
  }

  async findAllEnabled(): Promise<AdOptimizationConfigDocument[]> {
    return this.adOptimizationConfigModel
      .find({
        isDeleted: false,
        isEnabled: true,
      })
      .lean()
      .exec();
  }
}
