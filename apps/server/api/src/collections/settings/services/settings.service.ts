import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import {
  Setting,
  type SettingDocument,
} from '@api/collections/settings/schemas/setting.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class SettingsService extends BaseService<
  SettingDocument,
  CreateSettingDto,
  UpdateSettingDto
> {
  constructor(
    @InjectModel(Setting.name, DB_CONNECTIONS.AUTH)
    model: AggregatePaginateModel<SettingDocument>,
    logger: LoggerService,
  ) {
    super(model, logger);
  }
}
