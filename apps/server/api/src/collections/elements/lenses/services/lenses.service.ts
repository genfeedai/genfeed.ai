import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';
import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';
import {
  ElementLens,
  type ElementLensDocument,
} from '@api/collections/elements/lenses/schemas/lens.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsLensesService extends BaseService<
  ElementLensDocument,
  CreateElementLensDto,
  UpdateElementLensDto
> {
  constructor(
    @InjectModel(ElementLens.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementLensDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
