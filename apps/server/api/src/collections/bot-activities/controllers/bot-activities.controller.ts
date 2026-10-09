import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import {
  BotActivitiesService,
  type BotActivityStats,
} from '@api/collections/bot-activities/services/bot-activities.service';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { REPLY_BOT_FEATURE_FLAG } from '@genfeedai/contracts/constants';
import { BotActivitySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Bot Activities')
@AutoSwagger()
@FeatureFlag(REPLY_BOT_FEATURE_FLAG)
@OrganizationModule('messages')
@Controller('bot-activities')
export class BotActivitiesController {
  constructor(
    private readonly botActivitiesService: BotActivitiesService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Get paginated list of bot activities with filters
   */
  @TenantReadPolicy('selected')
  @Get()
  @ApiOperation({ summary: 'Get bot activities with pagination and filters' })
  @ApiResponse({
    description: 'Returns paginated bot activities',
    status: 200,
  })
  async findAll(
    @Req() req: Request,
    @Query() query: BotActivitiesQueryDto,
    @CurrentUser() user: User,
  ) {
    const readScope = resolveTenantReadScope(user);
    const { activities, total } =
      await this.botActivitiesService.findWithFilters(
        readScope.organizationId,
        readScope.brandId,
        query,
      );

    return serializeCollection(req, BotActivitySerializer, {
      docs: activities,
      total,
    });
  }

  /**
   * Get a single bot activity by ID
   */
  @TenantReadPolicy('selected')
  @Get(':id')
  @ApiOperation({ summary: 'Get a single bot activity' })
  @ApiResponse({
    description: 'Returns the bot activity',
    status: 200,
  })
  async findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentUser() user: User,
  ) {
    const readScope = resolveTenantReadScope(user);
    const activity = await this.botActivitiesService.findOne({
      ...(readScope.brandId ? { brandId: readScope.brandId } : {}),
      id: id,
      organizationId: readScope.organizationId,
    });
    return serializeSingle(req, BotActivitySerializer, activity);
  }

  /**
   * Get aggregated statistics for bot activities
   */
  @TenantReadPolicy('selected')
  @Get('stats/summary')
  @ApiOperation({ summary: 'Get aggregated bot activity statistics' })
  @ApiResponse({
    description: 'Returns activity statistics',
    status: 200,
  })
  getStats(
    @Query('replyBotConfigId') replyBotConfigId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @CurrentUser() user: User,
  ): Promise<BotActivityStats> {
    const readScope = resolveTenantReadScope(user);
    return this.botActivitiesService.getStats(
      readScope.organizationId,
      readScope.brandId,
      replyBotConfigId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }
}
