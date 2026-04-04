import { CreateElementSoundDto } from '@api/collections/elements/sounds/dto/create-sound.dto';
import { UpdateElementSoundDto } from '@api/collections/elements/sounds/dto/update-sound.dto';
import {
  ElementSound,
  type ElementSoundDocument,
} from '@api/collections/elements/sounds/schemas/sound.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class ElementsSoundsService extends BaseService<
  ElementSoundDocument,
  CreateElementSoundDto,
  UpdateElementSoundDto
> {
  constructor(
    @InjectModel(ElementSound.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ElementSoundDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
