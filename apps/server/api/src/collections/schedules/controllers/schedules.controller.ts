import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import type { ValidateChannelTargetSettingsInput } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ScheduleSerializer } from '@genfeedai/serializers';
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Schedules')
@FeatureFlag('publishing')
@OrganizationModule('publishing')
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Get('channel-capabilities')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  listChannelCapabilities(
    @Query('includeHidden') includeHidden?: string,
    @Query('includePlanned') includePlanned?: string,
  ) {
    return this.schedulesService.listChannelCapabilities({
      includeHidden: this.parseBooleanQuery(includeHidden),
      includePlanned: this.parseBooleanQuery(includePlanned),
    });
  }

  @Get('channel-capabilities/:platform')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  getChannelCapability(@Param('platform') platform: string) {
    return this.schedulesService.getChannelCapability(platform);
  }

  @Post('channel-capabilities/validate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  validateChannelTargetSettings(
    @Body() input: ValidateChannelTargetSettingsInput,
  ) {
    return this.schedulesService.validateChannelTargetSettings(input);
  }

  /**
   * Get the best posting time: learned from the organization's own measured
   * posts, or labelled default times when there is not enough data.
   */
  @Post('optimal')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOptimalTime(
    @Body() dto: GetOptimalTimeDto,
    @CurrentUser() user: User,
  ) {
    return await this.schedulesService.getOptimalTime(dto, user.organizationId);
  }

  /**
   * Bulk schedule content
   */
  @Post('bulk')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async bulkSchedule(@Body() dto: BulkScheduleDto, @CurrentUser() user: User) {
    const organization = user.organizationId;
    return await this.schedulesService.bulkSchedule(dto, organization, user.id);
  }

  /**
   * Get schedule calendar
   */
  @TenantReadPolicy('selected')
  @Get('calendar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCalendar(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const readScope = resolveTenantReadScope(user);
    const organization = readScope.organizationId;

    const startDate = start || new Date().toISOString();
    const endDate =
      end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const schedules = await this.schedulesService.getCalendar(
      organization,
      startDate,
      endDate,
    );

    return serializeCollection(req, ScheduleSerializer, { docs: schedules });
  }

  private parseBooleanQuery(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    return ['1', 'true', 'yes'].includes(value.toLowerCase());
  }
}
