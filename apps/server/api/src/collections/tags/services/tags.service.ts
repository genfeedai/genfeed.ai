import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';
import {
  Tag,
  type TagDocument,
} from '@api/collections/tags/schemas/tag.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class TagsService extends BaseService<
  TagDocument,
  CreateTagDto,
  UpdateTagDto
> {
  constructor(
    @InjectModel(Tag.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<TagDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }
}
