import { CreateFontFamilyDto } from '@api/collections/font-families/dto/create-font-family.dto';
import { UpdateFontFamilyDto } from '@api/collections/font-families/dto/update-font-family.dto';
import {
  FontFamily,
  type FontFamilyDocument,
} from '@api/collections/font-families/schemas/font-family.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class FontFamiliesService extends BaseService<
  FontFamilyDocument,
  CreateFontFamilyDto,
  UpdateFontFamilyDto
> {
  constructor(
    @InjectModel(FontFamily.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<FontFamilyDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
