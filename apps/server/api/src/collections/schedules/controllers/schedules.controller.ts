import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { BulkScheduleDto } from '@api/collections/schedules/dto/bulk-schedule.dto';
import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { SchedulesService } from '@api/collections/schedules/services/schedules.service';
import {
  Credits,
  DeferCreditsUntilModelResolution,
} from '@api/helpers/decorators/credits/credits.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { finalizeDeferredTextCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import {
  assertOrganizationCreditsAvailable,
  getDefaultTextMinimumCredits,
} from '@api/helpers/utils/credits/organization-credits-gate.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import { ActivitySource } from '@genfeedai/contracts';
import type { ValidateChannelTargetSettingsInput } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { ScheduleSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('Schedules')
@Controller('schedules')
@UseInterceptors(CreditsInterceptor)
export class SchedulesController {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly modelsService: ModelsService,
  ) {}

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
   * Get optimal posting time
   */
  @Post('optimal')
  @UseGuards(SubscriptionGuard, CreditsGuard)
  @Credits({
    description: 'Optimal schedule suggestion (text model)',
    source: ActivitySource.SCRIPT,
  })
  @DeferCreditsUntilModelResolution()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOptimalTime(
    @Req() req: Request,
    @Body() dto: GetOptimalTimeDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    await assertOrganizationCreditsAvailable(
      this.creditsUtilsService,
      organization,
      await getDefaultTextMinimumCredits(this.modelsService),
    );
    let billedCredits = 0;
    const result = await this.schedulesService.getOptimalTime(
      dto,
      organization,
      (amount) => {
        billedCredits += amount;
      },
    );
    finalizeDeferredTextCredits(req, billedCredits);
    return result;
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
  @Get('calendar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getCalendar(
    @Req() req: Request,
    @CurrentUser() user: User,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const organization = user.organizationId;

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
