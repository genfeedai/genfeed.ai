import { CreateCaptionDto } from '@api/collections/captions/dto/create-caption.dto';
import { UpdateCaptionDto } from '@api/collections/captions/dto/update-caption.dto';
import {
  Caption,
  type CaptionDocument,
} from '@api/collections/captions/schemas/caption.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CaptionsService extends BaseService<
  CaptionDocument,
  CreateCaptionDto,
  UpdateCaptionDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Caption.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<CaptionDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
