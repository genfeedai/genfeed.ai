import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';
import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';
import {
  Link,
  type LinkDocument,
} from '@api/collections/links/schemas/link.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class LinksService extends BaseService<
  LinkDocument,
  CreateLinkDto,
  UpdateLinkDto
> {
  constructor(
    @InjectModel(Link.name, DB_CONNECTIONS.CLOUD)
    model: AggregatePaginateModel<LinkDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }
}
