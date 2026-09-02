import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import {
  BotActivitiesService,
  type BotActivityStats,
} from '@api/collections/bot-activities/services/bot-activities.service';
import { FeatureFlag } from '@api/feature-flag/feature-flag.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
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
    const { activities, total } =
      await this.botActivitiesService.findWithFilters(
        user.organizationId,
        user.brandId,
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
    const activity = await this.botActivitiesService.findOne({
      ...(user.brandId ? { brandId: user.brandId } : {}),
      id: id,
      organizationId: user.organizationId,
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
    @Query('replyBotConfigId') replyBotConfigId: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
    @CurrentUser() user: User,
  ): Promise<BotActivityStats> {
    return this.botActivitiesService.getStats(
      user.organizationId,
      user.brandId,
      replyBotConfigId,
      fromDate ? new Date(fromDate) : undefined,
      toDate ? new Date(toDate) : undefined,
    );
  }
}
