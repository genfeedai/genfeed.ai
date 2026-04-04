import { CreateElementMoodDto } from '@api/collections/elements/moods/dto/create-mood.dto';
import { UpdateElementMoodDto } from '@api/collections/elements/moods/dto/update-mood.dto';
import {
  ElementMood,
  type ElementMoodDocument,
} from '@api/collections/elements/moods/schemas/mood.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsMoodsService extends BaseService<
  ElementMoodDocument,
  CreateElementMoodDto,
  UpdateElementMoodDto
> {
  constructor(
    @InjectModel(ElementMood.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementMoodDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
