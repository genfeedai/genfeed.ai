import { UpdatePlatformSettingDto } from '@api/collections/platform-settings/dto/update-platform-setting.dto';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { PlatformSettingSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Admin / Platform Settings')
@Controller('admin/platform-settings')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class PlatformSettingsController {
  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly loggerService: LoggerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get platform-wide operator settings (singleton)' })
  async get(@Req() request: Request) {
    try {
      const settings = await this.platformSettingsService.getSingleton();
      return serializeSingle(request, PlatformSettingSerializer, settings);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'getPlatformSettings',
      );
    }
  }

  @Patch()
  @ApiOperation({
    summary: 'Update platform-wide operator settings (singleton)',
  })
  async update(@Req() request: Request, @Body() dto: UpdatePlatformSettingDto) {
    try {
      const settings = await this.platformSettingsService.updateSingleton(dto);
      return serializeSingle(request, PlatformSettingSerializer, settings);
    } catch (error) {
      return ErrorResponse.handle(
        error,
        this.loggerService,
        'updatePlatformSettings',
      );
    }
  }
}
