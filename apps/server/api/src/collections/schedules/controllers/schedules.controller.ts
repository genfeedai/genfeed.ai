import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { ApiKeyReadAccess } from '@api/helpers/decorators/scopes/api-key-read-access.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import type { ValidateChannelTargetSettingsInput } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@AutoSwagger()
@ApiTags('Schedules')
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
  @ApiKeyReadAccess()
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
  @ApiKeyReadAccess()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOptimalTime(
    @Body() dto: GetOptimalTimeDto,
    @CurrentUser() user: User,
  ) {
    return await this.schedulesService.getOptimalTime(dto, user.organizationId);
  }

  private parseBooleanQuery(value?: string): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    return ['1', 'true', 'yes'].includes(value.toLowerCase());
  }
}
