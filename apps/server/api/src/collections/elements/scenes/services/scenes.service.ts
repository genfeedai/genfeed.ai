import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';
import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';
import {
  ElementScene,
  type ElementSceneDocument,
} from '@api/collections/elements/scenes/schemas/scene.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsScenesService extends BaseService<
  ElementSceneDocument,
  CreateElementSceneDto,
  UpdateElementSceneDto
> {
  constructor(
    @InjectModel(ElementScene.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementSceneDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
