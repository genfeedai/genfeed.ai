import { CreateSettingDto } from '@server/collections/settings/dto/create-setting.dto';
import { UpdateSettingDto } from '@server/collections/settings/dto/update-setting.dto';
import type { SettingDocument } from '@server/collections/settings/schemas/setting.schema';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SettingsService extends BaseService<
  SettingDocument,
  CreateSettingDto,
  UpdateSettingDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'setting', logger);
  }
}
