import { CreateSettingDto } from '@api/collections/settings/dto/create-setting.dto';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import type { SettingDocument } from '@api/collections/settings/schemas/setting.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
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
