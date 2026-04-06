import type { CreateModelDto } from '@api/collections/models/dto/create-model.dto';
import type { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';
import {
  Model,
  type ModelDocument,
} from '@api/collections/models/schemas/model.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import type { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, UpdateQuery } from 'mongoose';

@Injectable()
export class ModelsService extends BaseService<
  ModelDocument,
  CreateModelDto,
  UpdateModelDto
> {
  constructor(
    @InjectModel(Model.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<ModelDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }

  async updateMany(
    filter: Record<string, unknown>,
    update: UpdateQuery<ModelDocument>,
  ): Promise<void> {
    await this.model.updateMany(filter, update);
  }

  count(filter: Record<string, unknown>): Promise<number> {
    return this.model.countDocuments(filter);
  }

  /**
   * Find all active models (for use in organization settings initialization)
   */
  async findAllActive(
    filter?: FilterQuery<ModelDocument>,
  ): Promise<ModelDocument[]> {
    return this.model
      .find({
        isActive: true,
        isDeleted: false,
        ...filter,
      })
      .lean()
      .exec();
  }
}
