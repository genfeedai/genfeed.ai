import { CreateElementStyleDto } from '@api/collections/elements/styles/dto/create-style.dto';
import { UpdateElementStyleDto } from '@api/collections/elements/styles/dto/update-style.dto';
import {
  ElementStyle,
  type ElementStyleDocument,
} from '@api/collections/elements/styles/schemas/style.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsStylesService extends BaseService<
  ElementStyleDocument,
  CreateElementStyleDto,
  UpdateElementStyleDto
> {
  constructor(
    @InjectModel(ElementStyle.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementStyleDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
