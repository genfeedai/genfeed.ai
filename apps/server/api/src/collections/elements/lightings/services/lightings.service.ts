import { CreateElementLightingDto } from '@api/collections/elements/lightings/dto/create-lighting.dto';
import { UpdateElementLightingDto } from '@api/collections/elements/lightings/dto/update-lighting.dto';
import {
  ElementLighting,
  type ElementLightingDocument,
} from '@api/collections/elements/lightings/schemas/lighting.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsLightingsService extends BaseService<
  ElementLightingDocument,
  CreateElementLightingDto,
  UpdateElementLightingDto
> {
  constructor(
    @InjectModel(ElementLighting.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementLightingDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
