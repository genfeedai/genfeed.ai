import { ImageDocument } from '@api/collections/images/schemas/image.schema';
import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ImagesService extends IngredientsService {
  constructor(
    @InjectModel(Ingredient.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ImageDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
