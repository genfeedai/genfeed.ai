import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';
import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';
import type { MusicDocument } from '@api/collections/musics/schemas/music.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class MusicsService extends BaseService<
  MusicDocument,
  CreateMusicDto,
  UpdateMusicDto
> {
  constructor(
    @InjectModel(Ingredient.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<MusicDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
