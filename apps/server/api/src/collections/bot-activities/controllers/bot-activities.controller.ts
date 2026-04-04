import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import {
  BotActivitiesService,
  type BotActivityStats,
} from '@api/collections/bot-activities/services/bot-activities.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { BotActivitySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@ApiTags('Bot Activities')
@AutoSwagger()
@FeatureFlag('reply_bot')
@Controller('bot-activities')
export class BotActivitiesController {
  constructor(
    private readonly botActivitiesService: BotActivitiesService,
    readonly _loggerService: LoggerService,
  ) {}

  /**
   * Get paginated list of bot activities with filters
   */
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
    const publicMetadata = getPublicMetadata(user);

    const { activities, total } =
      await this.botActivitiesService.findWithFilters(
        publicMetadata.organization,
        publicMetadata.brand,
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
    const publicMetadata = getPublicMetadata(user);

    const activity = await this.botActivitiesService.findOne({
      ...(publicMetadata.brand ? { brand: publicMetadata.brand } : {}),
      _id: id,
      isDeleted: false,
      organization: publicMetadata.organization,
    });
    return serializeSingle(req, BotActivitySerializer, activity);
  }

  /**
   * Get aggregated statistics for bot activities
   */
  @Get('stats/summary')
  @ApiOperation({ summary: 'Get aggregated bot activity statistics' })
  @ApiResponse({
    description: 'Returns activity statistics',
    status: 200,
  })
  getStats(
    @Query('replyBotConfig') replyBotConfigId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @CurrentUser() user: User,
  ): Promise<BotActivityStats> {
    const publicMetadata = getPublicMetadata(user);

    return this.botActivitiesService.getStats(
      publicMetadata.organization,
      publicMetadata.brand,
      replyBotConfigId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }

  /**
   * Get recent activities for a specific bot config
   */
  @Get('recent/:configId')
  @ApiOperation({ summary: 'Get recent activities for a bot config' })
  @ApiResponse({
    description: 'Returns recent activities',
    status: 200,
  })
  async getRecentByConfig(
    @Req() req: Request,
    @Param('configId') configId: string,
    @Query('limit') limit: number = 10,
    @CurrentUser() user: User,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const docs = await this.botActivitiesService.findRecentByConfig(
      configId,
      publicMetadata.brand,
      limit,
    );
    return serializeCollection(req, BotActivitySerializer, { docs });
  }
}
