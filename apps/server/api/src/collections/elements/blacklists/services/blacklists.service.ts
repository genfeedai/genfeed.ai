import { CreateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/create-blacklist.dto';
import { UpdateElementBlacklistDto } from '@api/collections/elements/blacklists/dto/update-blacklist.dto';
import {
  ElementBlacklist,
  type ElementBlacklistDocument,
} from '@api/collections/elements/blacklists/schemas/blacklist.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { QueryFilter, UpdateWriteOpResult } from 'mongoose';

@Injectable()
export class ElementsBlacklistsService extends BaseService<
  ElementBlacklistDocument,
  CreateElementBlacklistDto,
  UpdateElementBlacklistDto
> {
  constructor(
    @InjectModel(ElementBlacklist.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementBlacklistDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  public delete(id: string): Promise<ElementBlacklistDocument | null> {
    // Soft delete - mark as deleted
    return this.model
      .findByIdAndUpdate(id, { isDeleted: true }, { returnDocument: 'after' })
      .exec();
  }

  public deleteAll(
    filter: QueryFilter<ElementBlacklistDocument>,
  ): Promise<UpdateWriteOpResult> {
    // Soft delete - mark as deleted
    return this.model.updateMany(filter, { isDeleted: true }).exec();
  }
}
